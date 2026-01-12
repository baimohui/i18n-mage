import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { getValueByAmbiguousEntryName, formatEscapeChar } from "@/utils/regex";
import { getCacheConfig } from "@/utils/config";
import { INLINE_HINTS_DISPLAY_MODE, InlineHintsDisplayMode } from "@/types";
import { ActiveEditorState } from "@/utils/activeEditorState";

export class DecoratorController implements vscode.Disposable {
  private static instance: DecoratorController;
  // 核心装饰器类型
  private translationDecoration: vscode.TextEditorDecorationType;
  private looseTranslationDecoration: vscode.TextEditorDecorationType;
  private hiddenKeyDecoration: vscode.TextEditorDecorationType;
  private disposed = false;

  // 状态管理
  private currentDecorations = new Map<
    string,
    {
      startPos: number;
      endPos: number;
      value: string;
      isLooseMatch: boolean;
    }
  >();
  private lastCursorLine: number = -1;
  private currentEditor?: vscode.TextEditor;

  constructor() {
    // 初始化翻译文本装饰器
    this.translationDecoration = this.setTranslationDecoration();
    this.looseTranslationDecoration = this.setTranslationDecoration(true);
    // 初始化隐藏原始 key 的装饰器
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

  public update(editor: vscode.TextEditor | undefined): void {
    this.currentDecorations.clear();
    if (this.disposed || !editor) return;
    if (!getCacheConfig<boolean>("translationHints.enable")) {
      editor.setDecorations(this.translationDecoration, []);
      editor.setDecorations(this.looseTranslationDecoration, []);
      editor.setDecorations(this.hiddenKeyDecoration, []);
      return;
    }
    this.currentEditor = editor;
    const mage = LangMage.getInstance();
    const { tree, countryMap } = mage.langDetail;
    const translations = countryMap[treeInstance.displayLang];
    if (translations === undefined) return;
    const entries = Array.from(ActiveEditorState.definedEntries.values())
      .flat()
      .filter(item => item.visible);
    const maxLen = getCacheConfig<number>("translationHints.maxLength");
    const enableLooseKeyMatch = getCacheConfig<boolean>("translationHints.enableLooseKeyMatch");
    const dynamicMatchInfo = ActiveEditorState.dynamicMatchInfo;
    const applyToStringLiterals = getCacheConfig<boolean>("translationHints.applyToStringLiterals");
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
      const uniqueId = `${startPos}:${entry.nameInfo.name}`;
      const formattedEntryValue = this.formatEntryValue(entryValue, maxLen);
      this.currentDecorations.set(uniqueId, {
        startPos,
        endPos,
        value: formattedEntryValue,
        isLooseMatch
      });
    });
    this.applyDecorations(editor);
  }

  // 处理光标移动
  public handleCursorMove(event: vscode.TextEditorSelectionChangeEvent): void {
    if (event.textEditor !== this.currentEditor) return;
    const cursorLine = event.selections[0].active.line;
    // 只有跨行移动时才更新（性能优化）
    if (cursorLine === this.lastCursorLine) return;
    this.lastCursorLine = cursorLine;
    // 更新装饰器状态
    this.applyDecorations(this.currentEditor);
  }

  // 文档变化处理
  public handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (event.contentChanges.length === 0) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== event.document) return;
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
    // 如果改动在可视区域内 或者包含换行/潜在 TEntry，触发更新
    const fullText = changedTextSnippets.join("\n");
    if (
      affected ||
      fullText.includes("\n") ||
      Array.from(ActiveEditorState.definedEntries.values())
        .flat()
        .some(item => item.visible)
    ) {
      this.update(editor);
    }
  }

  public handleVisibleRangesChange(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (event.textEditor !== this.currentEditor) return;
    this.update(this.currentEditor);
  }

  public updateTranslationDecoration() {
    this.translationDecoration.dispose();
    this.looseTranslationDecoration.dispose();
    this.translationDecoration = this.setTranslationDecoration();
    this.looseTranslationDecoration = this.setTranslationDecoration(true);
  }

  private formatEntryValue(entryValue: string, maxLen?: number): string {
    const formattedEntryValue = formatEscapeChar(entryValue);
    if (maxLen === undefined || formattedEntryValue.length <= maxLen) return formattedEntryValue;
    return formattedEntryValue.slice(0, maxLen) + "...";
  }

  // 应用装饰器（根据光标位置切换状态）
  private applyDecorations(editor: vscode.TextEditor): void {
    if (!this.currentEditor) return;
    const cursorLine = this.currentEditor.selection.active.line;
    const translationDecorations: vscode.DecorationOptions[] = [];
    const looseTranslationDecorations: vscode.DecorationOptions[] = [];
    const hiddenKeyDecorations: vscode.DecorationOptions[] = [];
    const isInline = getCacheConfig<InlineHintsDisplayMode>("translationHints.displayMode") === INLINE_HINTS_DISPLAY_MODE.inline;
    const isItalic = getCacheConfig<boolean>("translationHints.italic");
    this.currentDecorations.forEach(({ startPos, endPos, value, isLooseMatch }) => {
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
        const appendedDec = {
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
        const hiddenKeyDec: vscode.DecorationOptions = { range: new vscode.Range(globalStartPos, globalEndPos) };
        hiddenKeyDecorations.push(hiddenKeyDec);
      }
    });
    // 设置装饰器
    editor.setDecorations(this.translationDecoration, translationDecorations);
    editor.setDecorations(this.looseTranslationDecoration, looseTranslationDecorations);
    editor.setDecorations(this.hiddenKeyDecoration, hiddenKeyDecorations);
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
    this.currentDecorations.clear();
    this.disposed = true;
  }
}
