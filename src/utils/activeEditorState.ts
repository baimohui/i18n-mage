import * as vscode from "vscode";
import { catchPossibleEntries, catchTEntries, getLineEnding, isValidI18nCallablePath } from "./regex";
import LangMage from "@/core/LangMage";
import { getCacheConfig } from "./config";
import path from "path";
import { TEntry } from "@/types";

export class ActiveEditorState {
  private static visibleEntries: TEntry[] = [];
  private static keyAtCursor: string = "";
  private static offsetBase: number = 0;

  static updateVisibleEntries(editor?: vscode.TextEditor) {
    if (!editor) return;
    this.visibleEntries = [];
    const filePath = editor.document.uri.fsPath;
    if (isValidI18nCallablePath(filePath)) {
      const mage = LangMage.getInstance();
      // 获取可视区域范围
      const visibleRanges = editor.visibleRanges;
      const visibleStart = Math.min(...visibleRanges.map(r => r.start.line));
      const visibleEnd = Math.max(...visibleRanges.map(r => r.end.line));
      // 按行提取文本，避免全量 getText
      const visibleLines: string[] = [];
      for (let i = visibleStart; i <= visibleEnd; i++) {
        if (i < editor.document.lineCount) {
          visibleLines.push(editor.document.lineAt(i).text);
        }
      }
      const lineEnding = getLineEnding();
      const visibleText = visibleLines.join(lineEnding);
      this.offsetBase = editor.document.offsetAt(new vscode.Position(visibleStart, 0));
      const entries = catchTEntries(visibleText);
      const applyToStringLiterals = getCacheConfig<boolean>("translationHints.applyToStringLiterals");
      if (applyToStringLiterals) {
        catchPossibleEntries(visibleText, mage.langDetail.tree, path.basename(filePath)).forEach(entry => {
          entries.push({
            raw: entry.value,
            pos: entry.pos,
            vars: [],
            nameInfo: {
              text: entry.name,
              regex: new RegExp(entry.name),
              name: entry.name,
              boundKey: "",
              boundPrefix: "",
              vars: []
            }
          });
        });
      }
      entries.forEach(entry => {
        const [startPos, endPos] = entry.pos.split(",").map(pos => this.offsetBase + +pos);
        entry.pos = `${startPos},${endPos}`;
      });
      this.visibleEntries = entries;
    }
  }

  static updateKeyAtCursor(editor?: vscode.TextEditor) {
    if (!editor) return;
    const entry = this.getEntryAtPosition(editor.document, editor.selection.active);
    const keyAtCursor = entry ? entry.nameInfo.name : "";
    vscode.commands.executeCommand("setContext", "i18nMage.inKey", !!keyAtCursor);
    this.keyAtCursor = keyAtCursor ?? "";
  }

  static getEntryAtPosition(document: vscode.TextDocument, position: vscode.Position): TEntry | undefined {
    const entry = this.visibleEntries.find(item => {
      const [startPos, endPos] = item.pos.split(",").map(pos => document.positionAt(+pos - 1));
      const range = new vscode.Range(startPos, endPos);
      return range.contains(position);
    });
    return entry;
  }

  static getVisibleEntries(): TEntry[] {
    return this.visibleEntries;
  }

  static getKeyAtCursor(): string {
    return this.keyAtCursor;
  }
}
