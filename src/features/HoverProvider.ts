import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import path from "path";
import { resolveEntryKeyFromName, displayToInternalName, escapeMarkdown, formatEscapeChar, unescapeString } from "@/utils/regex";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { isFileTooLarge, isPathInsideDirectory } from "@/utils/fs";
import { t } from "@/utils/i18n";
import { isReadonlyModeEnabled } from "@/utils/readonly";

export class HoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const langFileCtx = this.getLanguageFileContext(document);
    if (langFileCtx) {
      const langKey = this.getEntryKeyAtPositionInLangFile(document, position, langFileCtx);
      if (typeof langKey === "string" && langKey.length > 0) {
        return this.buildHoverForEntryKeys([langKey], document, position);
      }
    }

    if (isFileTooLarge(document.uri.fsPath)) return;
    const entry = ActiveEditorState.getEntryAtPosition(document, position);
    if (entry) {
      const entryKeys: string[] = [];
      const dynamicMatchInfo = ActiveEditorState.dynamicMatchInfo;
      const mage = LangMage.getInstance();
      const { tree } = mage.langDetail;
      const entryName = entry.nameInfo.name;
      if (entry.dynamic) {
        const matchedNames = dynamicMatchInfo.get(entryName) || [];
        const matchedKeys = matchedNames.map(name => resolveEntryKeyFromName(tree, name));
        entryKeys.push(...matchedKeys.filter((key): key is string => key !== undefined));
      } else {
        const entryKey = entry.nameInfo.key || resolveEntryKeyFromName(tree, entryName);
        if (typeof entryKey === "string" && entryKey.length > 0) {
          entryKeys.push(entryKey);
        }
      }
      if (entryKeys.length > 0) {
        return this.buildHoverForEntryKeys(entryKeys, document, position);
      }
    }
  }

  private buildHoverForEntryKeys(entryKeys: string[], document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    if (entryKeys.length === 0) return;
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    const { tree, dictionary } = mage.langDetail;
    const isReadonly = isReadonlyModeEnabled();
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    const referredLang = publicCtx.referredLang;
    const sortedLangList = [referredLang, ...mage.detectedLangList.filter(lang => lang !== referredLang)];
    const namespaces = Object.keys(tree);

    for (const key of entryKeys) {
      const entryName = displayToInternalName(unescapeString(key), namespaces);
      const entryInfo = dictionary[key]?.value ?? {};
      const usedInfo = mage.langDetail.used[entryName] ?? {};
      const referenceCount = Object.values(usedInfo).reduce((total, posSet) => total + posSet.size, 0);

      markdown.appendMarkdown(`**\`${entryName}\`**`);
      if (referenceCount > 0) {
        const copyNameArgs = encodeURIComponent(JSON.stringify({ label: entryName }));
        markdown.appendMarkdown(` [📋](command:i18nMage.copyName?${copyNameArgs})`);
        const copyEntryArgs = encodeURIComponent(JSON.stringify({ key }));
        markdown.appendMarkdown(`[📦](command:i18nMage.copyEntries?${copyEntryArgs})`);
        const refArgs = encodeURIComponent(
          JSON.stringify({
            key,
            anchorUri: document.uri.toString(),
            anchorPosition: {
              line: position.line,
              character: position.character
            }
          })
        );
        markdown.appendMarkdown(`[🔗${referenceCount}](command:i18nMage.findReferences?${refArgs})`);
      }
      markdown.appendMarkdown("\n\n");

      for (const lang of sortedLangList) {
        const value = entryInfo[lang] ?? "";
        const args = encodeURIComponent(JSON.stringify({ name: entryName, key, data: [key], meta: { lang }, description: value }));
        const rewriteActionArgs = encodeURIComponent(JSON.stringify({ name: entryName, key, description: value, meta: { lang } }));

        const isReferenceLang = lang === referredLang;
        const langLabel = isReferenceLang ? `**${escapeMarkdown(lang)}** (${t("hover.referenceLanguage")})` : `**${escapeMarkdown(lang)}**`;
        const goToDefBtn = `[📍](command:i18nMage.goToDefinition?${args})`;
        const copyBtn = value ? `[📋](command:i18nMage.copyValue?${args})` : "";
        const editBtn = isReadonly ? "" : `[✏️](command:i18nMage.editValue?${args})`;
        const rewriteBtn = isReadonly ? "" : `[🔄](command:i18nMage.rewriteAction?${rewriteActionArgs})`;
        const translateBtn =
          !isReadonly && !value && entryInfo[publicCtx.referredLang] ? `[🌐](command:i18nMage.fillMissingTranslations?${args})` : "";

        markdown.appendMarkdown(`${goToDefBtn} ${langLabel}: `);
        if (value) {
          markdown.appendMarkdown(`${escapeMarkdown(formatEscapeChar(value))}`);
        } else {
          markdown.appendMarkdown(`*${t("hover.empty")}*`);
        }
        markdown.appendMarkdown(` ${copyBtn}${translateBtn}${editBtn}${rewriteBtn}\n\n`);
      }

      if (key !== entryKeys[entryKeys.length - 1]) {
        markdown.appendMarkdown("---\n\n");
      }
    }
    return new vscode.Hover(markdown);
  }

  private getLanguageFileContext(document: vscode.TextDocument): { lang: string; fileScope: string } | null {
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    if (!publicCtx.langPath || !publicCtx.langFileType) return null;

    const filePath = document.uri.fsPath;
    if (!isPathInsideDirectory(publicCtx.langPath, filePath)) return null;
    const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
    if (ext !== publicCtx.langFileType.toLowerCase()) return null;

    const relPath = path.relative(publicCtx.langPath, filePath);
    const relSegs = relPath.split(path.sep).filter(Boolean);
    if (relSegs.length === 0) return null;

    const detectedLangs = mage.detectedLangList;
    const matchLang = (value: string) => detectedLangs.find(lang => lang.toLowerCase() === value.toLowerCase());

    let lang = "";
    let fileSegs: string[] = [];
    const firstSegLang = matchLang(relSegs[0]);
    if (typeof firstSegLang === "string" && firstSegLang.length > 0) {
      lang = firstSegLang;
      fileSegs = relSegs.slice(1);
    } else if (relSegs.length === 1) {
      const base = path.basename(relSegs[0], path.extname(relSegs[0]));
      const baseLang = matchLang(base);
      if (typeof baseLang !== "string" || baseLang.length === 0) return null;
      lang = baseLang;
      fileSegs = [];
    } else {
      return null;
    }

    let fileScope = "";
    if (fileSegs.length > 0) {
      const scopeSegs = fileSegs.slice();
      scopeSegs[scopeSegs.length - 1] = path.basename(scopeSegs[scopeSegs.length - 1], path.extname(scopeSegs[scopeSegs.length - 1]));
      fileScope = scopeSegs.join(".");
    }

    return { lang, fileScope };
  }

  private getEntryKeyAtPositionInLangFile(
    document: vscode.TextDocument,
    position: vscode.Position,
    ctx: { lang: string; fileScope: string }
  ): string | null {
    const mage = LangMage.getInstance();
    const dictionary = mage.langDetail.dictionary;
    const text = document.getText();

    for (const [key, entry] of Object.entries(dictionary)) {
      if (ctx.fileScope !== "" && entry.fileScope !== ctx.fileScope) continue;

      const fullKey = entry.fullPath || key;
      let realKey = fullKey;
      if (ctx.fileScope !== "" && fullKey.startsWith(`${ctx.fileScope}.`)) {
        realKey = fullKey.slice(ctx.fileScope.length + 1);
      }

      const valueRange = this.getValueRangeForKey(document, text, realKey);
      if (!valueRange) continue;
      if (valueRange.contains(position)) {
        return key;
      }
    }
    return null;
  }

  private getValueRangeForKey(doc: vscode.TextDocument, text: string, key: string): vscode.Range | null {
    const ext = path.extname(doc.uri.fsPath).toLowerCase();
    if (ext === ".yaml" || ext === ".yml") {
      return this.getYamlValueRange(doc, key);
    }
    return this.getJsonLikeValueRange(doc, text, key);
  }

  private getJsonLikeValueRange(doc: vscode.TextDocument, text: string, key: string): vscode.Range | null {
    const isEndWithNum = key.match(/\.(\d+)$/);
    const parts = key.split(/(?<!\\)\./).map(p => p.replace(/\\\./g, "."));
    let searchStart = 0;
    let valueStart: number | undefined;
    let valueEnd: number | undefined;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const isBeforeLast = i === parts.length - 2;
      const keyEsc = this.escapeReg(part);
      const lookaround = `(?<![\\w$])["']?${keyEsc}["']?(?![\\w$])`;
      const suffix = isLast ? "" : "\\s*[\\{\\[]";
      const pat = new RegExp(lookaround + `\\s*:` + suffix);
      const m = pat.exec(text.slice(searchStart));
      if (!m) return null;
      const matchIndex = searchStart + m.index;

      if (isLast || (isBeforeLast && isEndWithNum)) {
        const colonIndex = text.indexOf(":", matchIndex);
        if (colonIndex < 0) return null;
        const bounds = this.findJsonLikeValueBounds(text, colonIndex + 1);
        if (!bounds) return null;
        valueStart = bounds.start;
        valueEnd = bounds.end;
        break;
      }

      const objStart = matchIndex + m[0].length;
      const subText = text.slice(objStart);
      const closeIdx = this.findMatchingBrace(subText);
      if (closeIdx < 0) return null;
      searchStart = objStart;
    }

    if (valueStart !== undefined && valueEnd !== undefined) {
      const startPos = doc.positionAt(valueStart);
      const endPos = doc.positionAt(valueEnd);
      return new vscode.Range(startPos, endPos);
    }
    return null;
  }

  private findJsonLikeValueBounds(text: string, startAt: number): { start: number; end: number } | null {
    let i = startAt;
    while (i < text.length) {
      const ch = text[i];
      const next = text[i + 1];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === "/" && next === "/") {
        i += 2;
        while (i < text.length && text[i] !== "\n") i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        i += 2;
        while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i += 2;
        continue;
      }
      break;
    }

    const start = i;
    if (start >= text.length) return null;
    const quote = text[start];
    if (quote !== '"' && quote !== "'" && quote !== "`") return null;

    let escaped = false;
    let braceDepth = 0;
    for (let j = start + 1; j < text.length; j++) {
      const ch = text[j];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (quote === "`") {
        if (ch === "$" && text[j + 1] === "{") {
          braceDepth++;
          j++;
          continue;
        }
        if (ch === "}" && braceDepth > 0) {
          braceDepth--;
          continue;
        }
      }
      if (ch === quote && braceDepth === 0) {
        return { start: start + 1, end: j };
      }
    }
    return null;
  }

  private getYamlValueRange(doc: vscode.TextDocument, key: string): vscode.Range | null {
    const keyRange = this.getYamlKeyRange(doc, key);
    if (!keyRange) return null;
    const line = doc.lineAt(keyRange.start.line);
    const lineText = line.text;
    const colonIndex = lineText.indexOf(":", keyRange.end.character);
    if (colonIndex < 0) return null;
    const after = lineText.slice(colonIndex + 1);
    const trimmed = after.trimStart();
    if (!trimmed || trimmed.startsWith("|") || trimmed.startsWith(">")) return null;

    const valueStartChar = lineText.length - trimmed.length;
    const valueStartPos = new vscode.Position(line.lineNumber, valueStartChar);

    let valueEndChar = lineText.length;
    const quote = trimmed[0];
    if (quote === '"' || quote === "'") {
      let escaped = false;
      for (let i = valueStartChar + 1; i < lineText.length; i++) {
        const ch = lineText[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          valueEndChar = i + 1;
          break;
        }
      }
    }

    const valueEndPos = new vscode.Position(line.lineNumber, valueEndChar);
    return new vscode.Range(valueStartPos, valueEndPos);
  }

  private getYamlKeyRange(doc: vscode.TextDocument, key: string): vscode.Range | null {
    const parts = key.split(/(?<!\\)\./).map(p => p.replace(/\\\./g, "."));
    if (parts.length === 0) return null;

    type Scope = { start: number; end: number; parentIndent: number };
    let scope: Scope = { start: 0, end: doc.lineCount - 1, parentIndent: -1 };
    let finalRange: vscode.Range | null = null;

    for (const seg of parts) {
      if (/^\d+$/.test(seg)) {
        const item = this.findYamlSequenceItem(doc, scope, Number(seg));
        if (item === null) return null;
        scope = {
          start: item.line + 1,
          end: item.blockEnd,
          parentIndent: item.indent
        };
        continue;
      }

      const found = this.findYamlMapKey(doc, scope, seg);
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

  private escapeReg(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private getLineIndent(lineText: string): number {
    const m = lineText.match(/^\s*/);
    return m ? m[0].length : 0;
  }

  private isYamlIgnorableLine(lineText: string): boolean {
    const trimmed = lineText.trim();
    return trimmed.length === 0 || trimmed.startsWith("#");
  }

  private findYamlBlockEnd(doc: vscode.TextDocument, fromLine: number, parentIndent: number, limitEnd: number): number {
    let last = limitEnd;
    for (let i = fromLine + 1; i <= limitEnd; i++) {
      const text = doc.lineAt(i).text;
      if (this.isYamlIgnorableLine(text)) continue;
      const indent = this.getLineIndent(text);
      if (indent <= parentIndent) {
        return i - 1;
      }
      last = i;
    }
    return last;
  }

  private findYamlMapKey(
    doc: vscode.TextDocument,
    scope: { start: number; end: number; parentIndent: number },
    keySeg: string
  ): { line: number; indent: number; blockEnd: number; range: vscode.Range } | null {
    const rawKeyEscaped = this.escapeReg(keySeg);
    const quotedPattern = new RegExp(`^\\s*(["'])${rawKeyEscaped}\\1\\s*:\\s*`);
    const plainPattern = new RegExp(`^\\s*${rawKeyEscaped}\\s*:\\s*`);
    const childIndent = this.findDirectChildIndent(doc, scope);
    if (childIndent === null) return null;

    for (let i = scope.start; i <= scope.end; i++) {
      const text = doc.lineAt(i).text;
      if (this.isYamlIgnorableLine(text)) continue;
      const indent = this.getLineIndent(text);
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
        blockEnd: this.findYamlBlockEnd(doc, i, indent, scope.end),
        range: new vscode.Range(startPos, endPos)
      };
    }
    return null;
  }

  private findYamlSequenceItem(
    doc: vscode.TextDocument,
    scope: { start: number; end: number; parentIndent: number },
    targetIndex: number
  ): { line: number; indent: number; blockEnd: number } | null {
    const listIndent = this.findDirectSequenceIndent(doc, scope);
    if (listIndent === null) return null;
    let currentIdx = -1;

    for (let i = scope.start; i <= scope.end; i++) {
      const text = doc.lineAt(i).text;
      if (this.isYamlIgnorableLine(text)) continue;
      const indent = this.getLineIndent(text);
      if (indent !== listIndent) continue;
      const trimmed = text.trimStart();
      if (!trimmed.startsWith("-")) continue;

      currentIdx++;
      if (currentIdx !== targetIndex) continue;

      return {
        line: i,
        indent,
        blockEnd: this.findYamlBlockEnd(doc, i, indent, scope.end)
      };
    }
    return null;
  }

  private findDirectChildIndent(doc: vscode.TextDocument, scope: { start: number; end: number; parentIndent: number }): number | null {
    for (let i = scope.start; i <= scope.end; i++) {
      const text = doc.lineAt(i).text;
      if (this.isYamlIgnorableLine(text)) continue;
      const indent = this.getLineIndent(text);
      if (indent > scope.parentIndent) {
        return indent;
      }
    }
    return null;
  }

  private findDirectSequenceIndent(doc: vscode.TextDocument, scope: { start: number; end: number; parentIndent: number }): number | null {
    for (let i = scope.start; i <= scope.end; i++) {
      const text = doc.lineAt(i).text;
      if (this.isYamlIgnorableLine(text)) continue;
      const indent = this.getLineIndent(text);
      if (indent <= scope.parentIndent) continue;
      if (text.trimStart().startsWith("-")) {
        return indent;
      }
    }
    return null;
  }

  private findMatchingBrace(text: string): number {
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
}
