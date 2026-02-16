import path from "path";
import * as vscode from "vscode";

export async function getPropertyRange(uri: vscode.Uri, key: string): Promise<vscode.Range | null> {
  const ext = path.extname(uri.fsPath).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") {
    return getYamlPropertyRange(uri, key);
  }
  return getJsonLikePropertyRange(uri, key);
}

async function getJsonLikePropertyRange(uri: vscode.Uri, key: string): Promise<vscode.Range | null> {
  const isEndWithNum = key.match(/\.(\d+)$/);
  const parts = key.split(/(?<!\\)\./).map(p => p.replace(/\\\./g, "."));
  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  let searchStart = 0;
  let rangeStart: number | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;
    const isBeforeLast = i === parts.length - 2;
    const keyEsc = escapeReg(part);
    const lookaround = `(?<![\\w$])["']?${keyEsc}["']?(?![\\w$])`;
    const suffix = isLast ? "" : "\\s*[\\{\\[]";
    const pat = new RegExp(lookaround + `\\s*:` + suffix);
    const m = pat.exec(text.slice(searchStart));
    if (!m) {
      return null;
    }
    const matchIndex = searchStart + m.index;
    if (isLast || (isBeforeLast && isEndWithNum)) {
      const offset = matchIndex + m[0].indexOf(part);
      rangeStart = offset;
      break;
    }

    const objStart = matchIndex + m[0].length;
    const subText = text.slice(objStart);
    const closeIdx = findMatchingBrace(subText);
    if (closeIdx < 0) {
      return null;
    }
    searchStart = objStart;
  }

  if (rangeStart !== undefined) {
    const startPos = doc.positionAt(rangeStart);
    const endPos = startPos.translate(0, parts[parts.length - (isEndWithNum ? 2 : 1)].length);
    return new vscode.Range(startPos, endPos);
  }
  return null;
}

async function getYamlPropertyRange(uri: vscode.Uri, key: string): Promise<vscode.Range | null> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const parts = key.split(/(?<!\\)\./).map(p => p.replace(/\\\./g, "."));
  if (parts.length === 0) return null;

  type Scope = {
    start: number;
    end: number;
    parentIndent: number;
  };

  let scope: Scope = {
    start: 0,
    end: doc.lineCount - 1,
    parentIndent: -1
  };
  let finalRange: vscode.Range | null = null;

  for (const seg of parts) {
    if (/^\d+$/.test(seg)) {
      const item = findYamlSequenceItem(doc, scope, Number(seg));
      if (item === null) return null;
      scope = {
        start: item.line + 1,
        end: item.blockEnd,
        parentIndent: item.indent
      };
      continue;
    }

    const found = findYamlMapKey(doc, scope, seg);
    if (found === null) return null;
    finalRange = found.range;
    scope = {
      start: found.line + 1,
      end: found.blockEnd,
      parentIndent: found.indent
    };
  }

  return finalRange;
}

export async function selectProperty(uri: vscode.Uri, key: string) {
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const range = await getPropertyRange(uri, key);
  if (range) {
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range);
  }
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLineIndent(lineText: string): number {
  const m = lineText.match(/^\s*/);
  return m ? m[0].length : 0;
}

function isYamlIgnorableLine(lineText: string): boolean {
  const trimmed = lineText.trim();
  return trimmed.length === 0 || trimmed.startsWith("#");
}

function findYamlBlockEnd(doc: vscode.TextDocument, fromLine: number, parentIndent: number, limitEnd: number): number {
  let last = limitEnd;
  for (let i = fromLine + 1; i <= limitEnd; i++) {
    const text = doc.lineAt(i).text;
    if (isYamlIgnorableLine(text)) continue;
    const indent = getLineIndent(text);
    if (indent <= parentIndent) {
      return i - 1;
    }
    last = i;
  }
  return last;
}

function findYamlMapKey(
  doc: vscode.TextDocument,
  scope: { start: number; end: number; parentIndent: number },
  keySeg: string
): { line: number; indent: number; blockEnd: number; range: vscode.Range } | null {
  const rawKeyEscaped = escapeReg(keySeg);
  const quotedPattern = new RegExp(`^\\s*(["'])${rawKeyEscaped}\\1\\s*:\\s*`);
  const plainPattern = new RegExp(`^\\s*${rawKeyEscaped}\\s*:\\s*`);
  const childIndent = findDirectChildIndent(doc, scope);
  if (childIndent === null) return null;

  for (let i = scope.start; i <= scope.end; i++) {
    const text = doc.lineAt(i).text;
    if (isYamlIgnorableLine(text)) continue;
    const indent = getLineIndent(text);
    if (indent !== childIndent) continue;
    if (text.slice(indent).startsWith("-")) continue;

    const quotedMatch = quotedPattern.exec(text);
    const plainMatch = plainPattern.exec(text);
    if (quotedMatch === null && plainMatch === null) continue;

    const keyStart = text.indexOf(keySeg, indent);
    if (keyStart < 0) continue;
    const startPos = new vscode.Position(i, keyStart);
    const endPos = new vscode.Position(i, keyStart + keySeg.length);
    return {
      line: i,
      indent,
      blockEnd: findYamlBlockEnd(doc, i, indent, scope.end),
      range: new vscode.Range(startPos, endPos)
    };
  }
  return null;
}

function findYamlSequenceItem(
  doc: vscode.TextDocument,
  scope: { start: number; end: number; parentIndent: number },
  targetIndex: number
): { line: number; indent: number; blockEnd: number } | null {
  const listIndent = findDirectSequenceIndent(doc, scope);
  if (listIndent === null) return null;
  let currentIdx = -1;

  for (let i = scope.start; i <= scope.end; i++) {
    const text = doc.lineAt(i).text;
    if (isYamlIgnorableLine(text)) continue;
    const indent = getLineIndent(text);
    if (indent !== listIndent) continue;
    const trimmed = text.trimStart();
    if (!trimmed.startsWith("-")) continue;

    currentIdx++;
    if (currentIdx !== targetIndex) continue;

    return {
      line: i,
      indent,
      blockEnd: findYamlBlockEnd(doc, i, indent, scope.end)
    };
  }
  return null;
}

function findDirectChildIndent(doc: vscode.TextDocument, scope: { start: number; end: number; parentIndent: number }): number | null {
  for (let i = scope.start; i <= scope.end; i++) {
    const text = doc.lineAt(i).text;
    if (isYamlIgnorableLine(text)) continue;
    const indent = getLineIndent(text);
    if (indent > scope.parentIndent) {
      return indent;
    }
  }
  return null;
}

function findDirectSequenceIndent(doc: vscode.TextDocument, scope: { start: number; end: number; parentIndent: number }): number | null {
  for (let i = scope.start; i <= scope.end; i++) {
    const text = doc.lineAt(i).text;
    if (isYamlIgnorableLine(text)) continue;
    const indent = getLineIndent(text);
    if (indent <= scope.parentIndent) continue;
    if (text.trimStart().startsWith("-")) {
      return indent;
    }
  }
  return null;
}

function findMatchingBrace(text: string): number {
  let depth = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
