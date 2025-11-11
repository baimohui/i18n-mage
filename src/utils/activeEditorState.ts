import * as vscode from "vscode";
import { catchLiteralEntries, catchTEntries, getValueByAmbiguousEntryName, isValidI18nCallablePath } from "./regex";
import LangMage from "@/core/LangMage";
import { getCacheConfig } from "./config";
import path from "path";
import { TEntry } from "@/types";
import { CodeLensProvider } from "@/features/CodeLensProvider";

export type DefinedEntryInEditor = TEntry & { visible: boolean; funcCall: boolean; dynamic: boolean };
export type UndefinedEntryInEditor = TEntry & { visible: boolean };

export class ActiveEditorState {
  public static definedEntries = new Map<string, DefinedEntryInEditor[]>();
  public static undefinedEntries = new Map<string, UndefinedEntryInEditor[]>();
  public static dynamicMatchInfo = new Map<string, string[]>();
  public static keyAtCursor: string = "";

  static update(editor?: vscode.TextEditor) {
    if (!editor) return;
    this.definedEntries = new Map();
    this.undefinedEntries = new Map();
    const filePath = editor.document.uri.fsPath;
    if (isValidI18nCallablePath(filePath)) {
      const mage = LangMage.getInstance();
      const text = editor.document.getText();
      const entries = catchTEntries(text);
      const publicCtx = mage.getPublicContext();
      const { used: usedEntryMap, tree } = mage.langDetail;
      const usedEntryNames = Object.keys(usedEntryMap);
      for (const entry of entries) {
        const [startPos, endPos] = entry.pos.split(",").map(pos => editor.document.positionAt(+pos - 1));
        const range = new vscode.Range(startPos, endPos);
        const visible = editor.visibleRanges.some(vr => vr.intersection(range));
        const { regex, name } = entry.nameInfo;
        if (Object.hasOwn(usedEntryMap, name)) {
          this.setDefinedEntry(name, { ...entry, visible, funcCall: true, dynamic: false });
          continue;
        }
        const matchKeys = usedEntryNames.filter(key => regex.test(key));
        if (matchKeys.length > 0) {
          this.setDefinedEntry(name, { ...entry, visible, funcCall: true, dynamic: true });
          this.dynamicMatchInfo.set(name, matchKeys);
          continue;
        }
        const key = getValueByAmbiguousEntryName(tree, name);
        if (key === undefined && !publicCtx.ignoredUndefinedEntries.includes(name)) {
          this.setUndefinedEntry(name, { ...entry, visible });
        }
      }

      const scanStringLiterals = getCacheConfig<boolean>("analysis.scanStringLiterals");
      if (scanStringLiterals) {
        const literalEntries = catchLiteralEntries(text, mage.langDetail.tree, path.basename(filePath));
        literalEntries.forEach(entry => {
          const [startPos, endPos] = entry.pos.split(",").map(pos => editor.document.positionAt(+pos - 1));
          const range = new vscode.Range(startPos, endPos);
          const visible = editor.visibleRanges.some(vr => vr.intersection(range));
          const literalEntry = {
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
            },
            visible,
            funcCall: false,
            dynamic: false
          };
          this.setDefinedEntry(entry.name, literalEntry);
        });
        this.definedEntries = new Map(
          [...this.definedEntries.entries()].sort((a, b) => +a[1][0].pos.split(",")[0] - +b[1][0].pos.split(",")[0])
        );
      }
      const codeLensProvider = new CodeLensProvider();
      setTimeout(() => codeLensProvider.refresh(), 0);
    }
    vscode.commands.executeCommand("setContext", "i18nMage.hasDefinedEntriesInFile", this.definedEntries.size > 0);
    vscode.commands.executeCommand("setContext", "i18nMage.hasUndefinedEntriesInFile", this.undefinedEntries.size > 0);
    this.updateVisibleEntries(editor);
    this.updateKeyAtCursor(editor);
  }

  private static setDefinedEntry(name: string, entry: DefinedEntryInEditor) {
    if (this.definedEntries.has(name)) {
      this.definedEntries.get(name)?.push(entry);
      this.definedEntries.get(name)?.sort((a, b) => +a.pos.split(",")[0] - +b.pos.split(",")[0]);
    } else {
      this.definedEntries.set(name, [entry]);
    }
  }

  private static setUndefinedEntry(name: string, entry: UndefinedEntryInEditor) {
    if (this.undefinedEntries.has(name)) {
      this.undefinedEntries.get(name)?.push(entry);
    } else {
      this.undefinedEntries.set(name, [entry]);
    }
  }

  static updateVisibleEntries(editor?: vscode.TextEditor) {
    if (!editor) return;
    this.definedEntries.forEach(entries => {
      entries.forEach(entry => {
        entry.visible = editor.visibleRanges.some(vr => {
          const [startPos, endPos] = entry.pos.split(",").map(pos => editor.document.positionAt(+pos - 1));
          const range = new vscode.Range(startPos, endPos);
          return vr.intersection(range);
        });
      });
    });
  }

  static updateKeyAtCursor(editor?: vscode.TextEditor) {
    if (!editor) return;
    const mage = LangMage.getInstance();
    const entry = this.getEntryAtPosition(editor.document, editor.selection.active);
    const keyAtCursor = entry ? (getValueByAmbiguousEntryName(mage.langDetail.tree, entry.nameInfo.name) ?? "") : "";
    vscode.commands.executeCommand("setContext", "i18nMage.inKey", !!keyAtCursor);
    this.keyAtCursor = keyAtCursor ?? "";
  }

  static getEntryAtPosition(document: vscode.TextDocument, position: vscode.Position): DefinedEntryInEditor | undefined {
    for (const entries of this.definedEntries.values()) {
      const entry = entries.find(item => {
        const [startPos, endPos] = item.pos.split(",").map(pos => document.positionAt(+pos - 1));
        const range = new vscode.Range(startPos, endPos);
        return range.contains(position);
      });
      if (entry) return entry;
    }
  }
}
