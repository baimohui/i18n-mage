import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import {
  getValueByAmbiguousEntryName,
  catchTEntries,
  getLineEnding,
  unescapeString,
  displayToInternalName,
  isValidI18nCallableFile
} from "@/utils/regex";
import { getConfig } from "@/utils/config";
import { TEntry } from "@/types";

export class DecoratorController implements vscode.Disposable {
  private static instance: DecoratorController;
  // 核心装饰器类型
  private translationDecoration: vscode.TextEditorDecorationType;
  private hiddenKeyDecoration: vscode.TextEditorDecorationType;
  private disposed = false;

  // 状态管理
  private currentDecorations = new Map<
    string,
    {
      translationDec: vscode.DecorationOptions;
      hiddenKeyDec: vscode.DecorationOptions;
    }
  >();
  private lastCursorLine: number = -1;
  private currentEditor?: vscode.TextEditor;
  public entries: TEntry[] = [];
  public offsetBase: number = 0;

  constructor() {
    // 初始化翻译文本装饰器
    this.translationDecoration = this.setTranslationDecoration();
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
    this.entries = [];
    this.currentDecorations.clear();
    if (this.disposed || !editor || !getConfig<boolean>("translationHints.enable", true)) return;
    const ignoredFileList = getConfig<string[]>("workspace.ignoredFileList", []);
    if (isValidI18nCallableFile(editor.document.uri.fsPath, ignoredFileList)) {
      const mage = LangMage.getInstance();
      const publicCtx = mage.getPublicContext();
      this.currentEditor = editor;
      const { tree, countryMap } = mage.langDetail;
      const translations = countryMap[publicCtx.referredLang];
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
      const entries = catchTEntries(visibleText, mage.i18nFeatures);
      this.entries = entries;
      const maxLen = getConfig<number>("translationHints.maxLength");
      const enableLooseKeyMatch = getConfig<boolean>("translationHints.enableLooseKeyMatch", true);
      const totalEntryList = Object.keys(mage.langDetail.dictionary).map(key => unescapeString(key));
      entries.forEach(entry => {
        let [startPos, endPos] = entry.pos.split(",").map(Number);
        startPos++;
        endPos--;
        const entryName = displayToInternalName(entry.nameInfo.text, mage.i18nFeatures);
        const entryKey = getValueByAmbiguousEntryName(tree, entryName);
        let entryValue = translations[entryKey as string];
        if (entryValue === undefined) {
          if (!enableLooseKeyMatch || entry.nameInfo.vars.length === 0) return;
          const matchedEntryName = totalEntryList.find(entryName => entry.nameInfo.regex.test(entryName)) ?? "";
          const matchedEntryKey = getValueByAmbiguousEntryName(tree, matchedEntryName);
          if (matchedEntryKey === undefined) return;
          entryValue = `"${translations[matchedEntryKey]}"`;
          startPos--;
          endPos++;
        }
        const globalStartPos = editor.document.positionAt(this.offsetBase + startPos);
        const globalEndPos = editor.document.positionAt(this.offsetBase + endPos);
        const range = new vscode.Range(globalStartPos, globalEndPos);
        const uniqueId = `${this.offsetBase + startPos}:${entry.nameInfo.id}`;
        const formattedEntryValue = this.formatEntryValue(entryValue, maxLen);
        const translationDec: vscode.DecorationOptions = { range, renderOptions: { before: { contentText: formattedEntryValue } } };
        const hiddenKeyDec: vscode.DecorationOptions = { range };
        this.currentDecorations.set(uniqueId, { translationDec, hiddenKeyDec });
      });
    }
    this.applyDecorations(editor);
  }

  // 处理光标移动
  public handleCursorMove(event: vscode.TextEditorSelectionChangeEvent): void {
    const editor = event.textEditor;
    this.currentEditor = editor;
    const cursorLine = event.selections[0].active.line;
    // 只有跨行移动时才更新（性能优化）
    if (cursorLine === this.lastCursorLine) return;
    this.lastCursorLine = cursorLine;
    // 更新装饰器状态
    this.applyDecorations(editor);
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
    const mage = LangMage.getInstance();
    if (affected || fullText.includes("\n") || catchTEntries(fullText, mage.i18nFeatures).length > 0) {
      this.update(editor);
    }
  }

  public handleVisibleRangesChange(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (event.textEditor !== this.currentEditor) return;
    this.update(this.currentEditor);
  }

  public updateTranslationDecoration() {
    this.translationDecoration.dispose();
    this.translationDecoration = this.setTranslationDecoration();
  }

  private formatEntryValue(entryValue: string, maxLen?: number): string {
    const clean = entryValue.replace(/\n/g, " ");
    if (maxLen === undefined || clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen) + "...";
  }

  // 应用装饰器（根据光标位置切换状态）
  private applyDecorations(editor: vscode.TextEditor): void {
    if (!this.currentEditor) return;
    const cursorLine = this.currentEditor.selection.active.line;
    const translationDecorations: vscode.DecorationOptions[] = [];
    const hiddenKeyDecorations: vscode.DecorationOptions[] = [];
    this.currentDecorations.forEach(({ translationDec, hiddenKeyDec }) => {
      const isOnCursorLine = translationDec.range.start.line <= cursorLine && translationDec.range.end.line >= cursorLine;
      if (!isOnCursorLine) {
        translationDecorations.push(translationDec);
        hiddenKeyDecorations.push(hiddenKeyDec);
      }
    });
    // 设置装饰器
    editor.setDecorations(this.translationDecoration, translationDecorations);
    editor.setDecorations(this.hiddenKeyDecoration, hiddenKeyDecorations);
  }

  private setTranslationDecoration() {
    return vscode.window.createTextEditorDecorationType({
      before: {
        color: this.getDecorationColor("light").color,
        backgroundColor: this.getDecorationColor("light").backgroundColor,
        // fontStyle: "italic",
        margin: "0 0 0 0"
      },
      dark: {
        before: this.getDecorationColor("dark")
      }
    });
  }

  private getDecorationColor(theme: "light" | "dark"): { color: string; backgroundColor: string } {
    let hex = getConfig<string>(`translationHints.${theme}.backgroundColor`);
    const alpha = getConfig<number>(`translationHints.${theme}.backgroundAlpha`);
    let color = getConfig<string>(`translationHints.${theme}.fontColor`);
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
    this.hiddenKeyDecoration.dispose();
    this.currentDecorations.clear();
    this.disposed = true;
  }
}
