import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { getValueByAmbiguousEntryName, catchTEntries } from "@/utils/regex";

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
        fontStyle: "italic",
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

    // 注册事件监听
    // vscode.workspace.onDidChangeTextDocument(this.handleDocumentChange.bind(this))
  }

  public static getInstance(): DecoratorController {
    if (DecoratorController.instance == null) {
      DecoratorController.instance = new DecoratorController();
    }
    return DecoratorController.instance;
  }

  public update(editor: vscode.TextEditor) {
    this.currentEditor = editor;
    this.clearAllDecorations(editor); // 清空旧装饰器
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    const { tree, countryMap } = mage.langDetail;
    const translations = countryMap[publicCtx.referredLang];
    const entries = catchTEntries(editor.document.getText());

    entries.forEach(entry => {
      const entryKey = getValueByAmbiguousEntryName(tree, entry.text);
      const entryValue = translations[entryKey as string];
      if (entryValue === undefined) return;
      const range = new vscode.Range(editor.document.positionAt(entry.pos), editor.document.positionAt(entry.pos + entry.text.length));
      const uniqueId = `${entry.pos}:${entry.id}`;
      const translationDec: vscode.DecorationOptions = { range, renderOptions: { before: { contentText: entryValue } } };
      // 创建隐藏原始 key 的装饰器
      const hiddenKeyDec: vscode.DecorationOptions = { range };
      // 保存状态
      this.currentDecorations.set(uniqueId, { translationDec, hiddenKeyDec });
    });
    // 应用新装饰器
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
    if (editor && editor.document === event.document) {
      let isOnTEntryLine = false;
      const changedLines = new Set<number>();
      const translationDecRanges: [number, number][] = [];
      this.currentDecorations.forEach(({ translationDec }) => {
        translationDecRanges.push([translationDec.range.start.line, translationDec.range.end.line]);
      });
      const isInRange = ([start, end]: [number, number], ranges: [number, number][]) => {
        return ranges.some(([s, e]) => (start >= s && start <= e) || (end >= s && end <= e) || (start <= s && end >= e));
      };
      const changedTextLines: string[] = [];
      event.contentChanges.forEach(change => {
        const startLine = change.range.start.line;
        const endLine = change.range.end.line;
        changedTextLines.push(change.text);
        if (isInRange([startLine, endLine], translationDecRanges)) {
          isOnTEntryLine = true;
        }
        for (let i = startLine; i <= endLine; i++) {
          changedLines.add(i);
        }
      });
      for (const lineNumber of changedLines) {
        if (lineNumber >= 0 && lineNumber < event.document.lineCount) {
          const line = event.document.lineAt(lineNumber);
          changedTextLines.push(line.text);
        }
      }
      if (isOnTEntryLine || catchTEntries(changedTextLines.join("\n")).length > 0) {
        this.update(editor);
      }
    }
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
