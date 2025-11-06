import * as vscode from "vscode";
import { catchPossibleEntries, catchTEntries, isValidI18nCallablePath } from "./regex";
import LangMage from "@/core/LangMage";
import { getCacheConfig } from "./config";
import path from "path";
import { TEntry } from "@/types";

export class ActiveEditorState {
  public static visibleEntries: TEntry[] = [];
  public static definedEntries: TEntry[] = [];
  public static undefinedEntries: TEntry[] = [];
  public static keyAtCursor: string = "";

  static update(editor?: vscode.TextEditor) {
    if (!editor) return;
    this.definedEntries = [];
    this.undefinedEntries = [];
    const filePath = editor.document.uri.fsPath;
    if (isValidI18nCallablePath(filePath)) {
      const mage = LangMage.getInstance();
      const text = editor.document.getText();
      const entries = catchTEntries(text);
      const publicCtx = mage.getPublicContext();
      const { used: usedEntryMap, undefined: undefinedEntryMap } = mage.langDetail;
      const usedEntryNames = Object.keys(usedEntryMap);
      for (const entry of entries) {
        const { regex, name, text } = entry.nameInfo;
        if (Object.hasOwn(undefinedEntryMap, text) && !publicCtx.ignoredUndefinedEntries.includes(name)) {
          this.undefinedEntries.push(entry);
          continue;
        }
        if (Object.hasOwn(usedEntryMap, name)) {
          this.definedEntries.push(entry);
          continue;
        }
        const matchList = usedEntryNames.filter(key => regex.test(key));
        matchList.forEach(matchItem => {
          if (!this.definedEntries.some(item => item.nameInfo.name === matchItem)) {
            const newEntry = { ...entry, nameInfo: { ...entry.nameInfo, text: matchItem, name: matchItem, id: matchItem } };
            this.definedEntries.push(newEntry);
          }
        });
      }

      const applyToStringLiterals = getCacheConfig<boolean>("translationHints.applyToStringLiterals");
      if (applyToStringLiterals) {
        catchPossibleEntries(text, mage.langDetail.tree, path.basename(filePath)).forEach(entry => {
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
    }
    vscode.commands.executeCommand("setContext", "i18nMage.hasDefinedEntriesInFile", this.definedEntries.length > 0);
    vscode.commands.executeCommand("setContext", "i18nMage.hasUndefinedEntriesInFile", this.undefinedEntries.length > 0);
    this.updateVisibleEntries(editor);
    this.updateKeyAtCursor(editor);
  }

  static updateVisibleEntries(editor?: vscode.TextEditor) {
    if (!editor) return;
    this.visibleEntries = this.definedEntries.filter(entry => {
      const [startPos, endPos] = entry.pos.split(",").map(pos => editor.document.positionAt(+pos - 1));
      const range = new vscode.Range(startPos, endPos);
      return editor.visibleRanges.some(vr => vr.intersection(range));
    });
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
}
