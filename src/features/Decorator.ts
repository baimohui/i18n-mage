import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { getValueByAmbiguousEntryName, catchTEntries, getLineEnding } from "@/utils/regex";

export class DecoratorController implements vscode.Disposable {
  private static instance: DecoratorController;
  // 核心装饰器类型
  private translationDecoration: vscode.TextEditorDecorationType;
  private hiddenKeyDecoration: vscode.TextEditorDecorationType;

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

  constructor() {
    // 初始化翻译文本装饰器
    this.translationDecoration = vscode.window.createTextEditorDecorationType({
      before: {
        color: "#569CD6",
        backgroundColor: "rgba(86, 156, 214, 0.1)",
        // fontStyle: "italic",
        margin: "0 0 0 0"
      },
      dark: {
        color: "#4EC9B0",
        backgroundColor: "rgba(78, 201, 176, 0.1)"
      }
    });
    // 初始化隐藏原始 key 的装饰器
    this.hiddenKeyDecoration = vscode.window.createTextEditorDecorationType({
      textDecoration: "none; opacity: 0; position: absolute; width: 0; height: 0; overflow: hidden;"
    });
  }

  public static getInstance(): DecoratorController {
    if (DecoratorController.instance == null) {
      DecoratorController.instance = new DecoratorController();
    }
    return DecoratorController.instance;
  }

  public update(editor: vscode.TextEditor | undefined): void {
    if (!editor) return;
    this.currentEditor = editor;
    this.clearAllDecorations(editor); // 清空旧装饰器
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
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
    const offsetBase = editor.document.offsetAt(new vscode.Position(visibleStart, 0));
    const entries = catchTEntries(visibleText);
    entries.forEach(entry => {
      const globalStartOffset = offsetBase + entry.pos;
      const entryKey = getValueByAmbiguousEntryName(tree, entry.text);
      const entryValue = translations[entryKey as string];
      if (entryValue === undefined) return;
      const startPos = editor.document.positionAt(globalStartOffset);
      const endPos = editor.document.positionAt(globalStartOffset + entry.text.length);
      const range = new vscode.Range(startPos, endPos);
      const uniqueId = `${globalStartOffset}:${entry.id}`;
      const translationDec: vscode.DecorationOptions = { range, renderOptions: { before: { contentText: entryValue } } };
      const hiddenKeyDec: vscode.DecorationOptions = { range };
      this.currentDecorations.set(uniqueId, { translationDec, hiddenKeyDec });
    });
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
    if (affected || fullText.includes("\n") || catchTEntries(fullText).length > 0) {
      this.update(editor);
    }
  }

  public handleVisibleRangesChange(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (event.textEditor !== this.currentEditor) return;
    this.update(this.currentEditor);
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

  // 清空所有装饰器
  private clearAllDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.translationDecoration, []);
    editor.setDecorations(this.hiddenKeyDecoration, []);
    this.currentDecorations.clear();
  }

  dispose(): void {
    this.translationDecoration.dispose();
    this.hiddenKeyDecoration.dispose();
    this.currentDecorations.clear();
  }
}
