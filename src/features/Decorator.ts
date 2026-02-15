import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { getValueByAmbiguousEntryName, formatEscapeChar } from "@/utils/regex";
import { getCacheConfig } from "@/utils/config";
import { INLINE_HINTS_DISPLAY_MODE, InlineHintsDisplayMode } from "@/types";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { isFileTooLarge } from "@/utils/fs";

type DecorationData = {
  startPos: number;
  endPos: number;
  value: string;
  isLooseMatch: boolean;
};

export class DecoratorController implements vscode.Disposable {
  private static instance: DecoratorController;
  private translationDecoration: vscode.TextEditorDecorationType;
  private looseTranslationDecoration: vscode.TextEditorDecorationType;
  private hiddenKeyDecoration: vscode.TextEditorDecorationType;
  private disposed = false;

  private decorationsByEditor = new Map<string, DecorationData[]>();
  private lastCursorLineByEditor = new Map<string, number>();
  private visibleEditorKeys = new Set<string>();

  constructor() {
    this.translationDecoration = this.setTranslationDecoration();
    this.looseTranslationDecoration = this.setTranslationDecoration(true);
    this.hiddenKeyDecoration = vscode.window.createTextEditorDecorationType({
      textDecoration: "none; opacity: 0; position: absolute; width: 0; height: 0; overflow: hidden;"
    });
  }

  public static getInstance(): DecoratorController {
    if (DecoratorController.instance === undefined || DecoratorController.instance.disposed) {
      DecoratorController.instance = new DecoratorController();
    }
    return DecoratorController.instance;
  }

  public updateVisibleEditors(
    editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors,
    options: { force?: boolean } = {}
  ): void {
    if (this.disposed) return;
    const { force = true } = options;
    const nextVisibleKeys = new Set(editors.map(editor => this.getEditorKey(editor)));
    this.visibleEditorKeys.forEach(key => {
      if (!nextVisibleKeys.has(key)) {
        this.decorationsByEditor.delete(key);
        this.lastCursorLineByEditor.delete(key);
      }
    });
    this.visibleEditorKeys = nextVisibleKeys;
    editors.forEach(editor => {
      const editorKey = this.getEditorKey(editor);
      if (!force && this.decorationsByEditor.has(editorKey)) return;
      ActiveEditorState.update(editor);
      this.update(editor);
    });
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      ActiveEditorState.update(activeEditor);
    }
  }

  public update(editor: vscode.TextEditor | undefined): void {
    if (this.disposed || !editor) return;
    const editorKey = this.getEditorKey(editor);

    if (!getCacheConfig<boolean>("translationHints.enable")) {
      this.clearEditorDecorations(editor, editorKey);
      return;
    }

    if (isFileTooLarge(editor.document.uri.fsPath)) {
      this.clearEditorDecorations(editor, editorKey);
      return;
    }

    const mage = LangMage.getInstance();
    const { tree, countryMap } = mage.langDetail;
    const translations = countryMap[treeInstance.displayLang];
    if (translations === undefined) {
      this.clearEditorDecorations(editor, editorKey);
      return;
    }

    const entries = Array.from(ActiveEditorState.definedEntries.values())
      .flat()
      .filter(item => item.visible);
    const maxLen = getCacheConfig<number>("translationHints.maxLength");
    const enableLooseKeyMatch = getCacheConfig<boolean>("translationHints.enableLooseKeyMatch");
    const dynamicMatchInfo = ActiveEditorState.dynamicMatchInfo;
    const applyToStringLiterals = getCacheConfig<boolean>("translationHints.applyToStringLiterals");

    const currentDecorations: DecorationData[] = [];

    entries.forEach(entry => {
      if (!applyToStringLiterals && !entry.funcCall) return;

      let [startPos, endPos] = entry.pos.split(",").map(Number);
      startPos++;
      endPos--;

      let entryKey = "";
      let entryValue = "";
      let isLooseMatch = false;

      if (entry.dynamic && dynamicMatchInfo.has(entry.nameInfo.name)) {
        if (!enableLooseKeyMatch) return;
        isLooseMatch = true;
        const matchedNames = dynamicMatchInfo.get(entry.nameInfo.name) || [];
        const matchedKeys = matchedNames
          .map(name => getValueByAmbiguousEntryName(tree, name))
          .filter((key): key is string => key !== undefined);
        entryValue = matchedKeys.map(key => translations[key]).join(" | ");
      } else {
        entryKey = getValueByAmbiguousEntryName(tree, entry.nameInfo.name) ?? "";
        entryValue = entryKey ? translations[entryKey] : "";
      }

      if (!entryValue) return;

      currentDecorations.push({
        startPos,
        endPos,
        value: this.formatEntryValue(entryValue, maxLen),
        isLooseMatch
      });
    });

    this.decorationsByEditor.set(editorKey, currentDecorations);
    this.applyDecorations(editor, currentDecorations);
  }

  public handleCursorMove(event: vscode.TextEditorSelectionChangeEvent): void {
    const editor = event.textEditor;
    const editorKey = this.getEditorKey(editor);
    const cursorLine = event.selections[0].active.line;

    if (cursorLine === this.lastCursorLineByEditor.get(editorKey)) return;

    this.lastCursorLineByEditor.set(editorKey, cursorLine);
    const decorations = this.decorationsByEditor.get(editorKey);
    if (!decorations) return;

    this.applyDecorations(editor, decorations);
  }

  public handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (event.contentChanges.length === 0) return;

    const editors = vscode.window.visibleTextEditors.filter(editor => editor.document === event.document);
    if (editors.length === 0) return;

    editors.forEach(editor => {
      let affected = false;
      const changedTextSnippets: string[] = [];
      const visibleRanges = editor.visibleRanges;
      const visibleStart = Math.min(...visibleRanges.map(r => r.start.line));
      const visibleEnd = Math.max(...visibleRanges.map(r => r.end.line));

      for (const change of event.contentChanges) {
        const startLine = change.range.start.line;
        const endLine = change.range.end.line;
        if (!change.range.isSingleLine || (endLine >= visibleStart && startLine <= visibleEnd)) {
          affected = true;
        }
        changedTextSnippets.push(change.text);
      }

      const fullText = changedTextSnippets.join("\n");
      if (
        affected ||
        fullText.includes("\n") ||
        Array.from(ActiveEditorState.definedEntries.values())
          .flat()
          .some(item => item.visible)
      ) {
        ActiveEditorState.update(editor);
        this.update(editor);
      }
    });
  }

  public handleVisibleRangesChange(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    ActiveEditorState.update(event.textEditor);
    this.update(event.textEditor);
  }

  public updateTranslationDecoration() {
    this.translationDecoration.dispose();
    this.looseTranslationDecoration.dispose();
    this.translationDecoration = this.setTranslationDecoration();
    this.looseTranslationDecoration = this.setTranslationDecoration(true);
    this.updateVisibleEditors();
  }

  private formatEntryValue(entryValue: string, maxLen?: number): string {
    const formattedEntryValue = formatEscapeChar(entryValue);
    if (maxLen === undefined || formattedEntryValue.length <= maxLen) return formattedEntryValue;
    return formattedEntryValue.slice(0, maxLen) + "...";
  }

  private applyDecorations(editor: vscode.TextEditor, decorations: DecorationData[]): void {
    const cursorLine = editor.selection.active.line;
    const translationDecorations: vscode.DecorationOptions[] = [];
    const looseTranslationDecorations: vscode.DecorationOptions[] = [];
    const hiddenKeyDecorations: vscode.DecorationOptions[] = [];
    const isInline = getCacheConfig<InlineHintsDisplayMode>("translationHints.displayMode") === INLINE_HINTS_DISPLAY_MODE.inline;
    const isItalic = getCacheConfig<boolean>("translationHints.italic");

    decorations.forEach(({ startPos, endPos, value, isLooseMatch }) => {
      if (isLooseMatch) {
        startPos--;
        endPos++;
      }

      const globalStartPos = editor.document.positionAt(startPos);
      let globalEndPos = editor.document.positionAt(endPos);
      const isOnCursorLine = globalStartPos.line <= cursorLine && globalEndPos.line >= cursorLine;

      if (isInline || isOnCursorLine) {
        if (isLooseMatch) {
          const document = editor.document;
          const text = document.getText();
          const searchStart = Math.max(startPos, 0);
          const searchEnd = Math.min(endPos - 1, text.length - 1);
          let quotePosition: number | null = null;
          for (let i = searchEnd; i >= searchStart; i--) {
            if (text[i] === '"' || text[i] === "'" || text[i] === "`") {
              quotePosition = i;
              break;
            }
          }
          if (quotePosition !== null) {
            globalEndPos = document.positionAt(quotePosition);
          }
        }

        const range = new vscode.Range(globalEndPos, globalEndPos);
        const appendedDec: vscode.DecorationOptions = {
          range,
          renderOptions: { before: { contentText: ` → ${value}`, fontStyle: isItalic ? "italic" : "normal" } }
        };
        if (isLooseMatch) {
          looseTranslationDecorations.push(appendedDec);
        } else {
          translationDecorations.push(appendedDec);
        }
      } else {
        const range = new vscode.Range(globalStartPos, globalEndPos);
        const overlayDec: vscode.DecorationOptions = {
          range,
          renderOptions: { before: { contentText: isLooseMatch ? `"${value}"` : value, fontStyle: isItalic ? "italic" : "normal" } }
        };
        if (isLooseMatch) {
          looseTranslationDecorations.push(overlayDec);
        } else {
          translationDecorations.push(overlayDec);
        }
        hiddenKeyDecorations.push({ range: new vscode.Range(globalStartPos, globalEndPos) });
      }
    });

    editor.setDecorations(this.translationDecoration, translationDecorations);
    editor.setDecorations(this.looseTranslationDecoration, looseTranslationDecorations);
    editor.setDecorations(this.hiddenKeyDecoration, hiddenKeyDecorations);
  }

  private getEditorKey(editor: vscode.TextEditor): string {
    return `${editor.document.uri.toString()}::${editor.viewColumn ?? "NA"}`;
  }

  private clearEditorDecorations(editor: vscode.TextEditor, editorKey: string): void {
    editor.setDecorations(this.translationDecoration, []);
    editor.setDecorations(this.looseTranslationDecoration, []);
    editor.setDecorations(this.hiddenKeyDecoration, []);
    this.decorationsByEditor.delete(editorKey);
    this.lastCursorLineByEditor.delete(editorKey);
  }

  private setTranslationDecoration(isLooseMatch: boolean = false) {
    const decoration: vscode.DecorationRenderOptions = {
      before: this.getDecoration("light"),
      dark: {
        before: this.getDecoration("dark")
      }
    };
    if (isLooseMatch) {
      decoration.before!.textDecoration = "underline dotted";
      decoration.dark!.before!.textDecoration = "underline dotted";
    }
    return vscode.window.createTextEditorDecorationType(decoration);
  }

  private getDecoration(theme: "light" | "dark"): { color: string; backgroundColor: string } {
    let hex = getCacheConfig<string>(`translationHints.${theme}.backgroundColor`);
    const alpha = getCacheConfig<number>(`translationHints.${theme}.backgroundAlpha`);
    let color = getCacheConfig<string>(`translationHints.${theme}.fontColor`);
    const isValidHexColor = (value: string): boolean => {
      return /^#([0-9a-fA-F]{6})$/.test(value.trim());
    };
    if (!isValidHexColor(hex)) {
      hex = theme === "light" ? "#569CD6" : "#4EC9B0";
    }
    if (!isValidHexColor(color)) {
      color = theme === "light" ? "#569CD6" : "#4EC9B0";
    }
    return {
      color,
      backgroundColor: this.hexToRgba(hex, alpha)
    };
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  dispose(): void {
    this.translationDecoration.dispose();
    this.looseTranslationDecoration.dispose();
    this.hiddenKeyDecoration.dispose();
    this.decorationsByEditor.clear();
    this.lastCursorLineByEditor.clear();
    this.visibleEditorKeys.clear();
    this.disposed = true;
  }
}
