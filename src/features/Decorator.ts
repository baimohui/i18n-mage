import { TEntry } from "@/types";
import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { getValueByAmbiguousEntryName } from "@/utils/regex";

export class DecoratorController implements vscode.Disposable {
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
  private disposables: vscode.Disposable[] = [];
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
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(this.handleCursorMove.bind(this)),
      // vscode.window.onDidChangeActiveTextEditor(editor => {
      //   this.currentEditor = editor;
      //   if (editor) this.update(editor);
      // }),
      vscode.workspace.onDidChangeTextDocument(this.handleDocumentChange.bind(this))
    );
  }

  update(editor: vscode.TextEditor, entries: TEntry[]) {
    // // 清空旧装饰
    // editor.setDecorations(this.replacedDecoration, []);
    // editor.setDecorations(this.replacementDecoration, []);
    // 清空旧装饰器
    this.clearAllDecorations(editor);

    // const replacementTexts: vscode.DecorationOptions[] = [];
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    const { tree, countryMap } = mage.langDetail;
    const translations = countryMap[publicCtx.referredLang];

    // entries.forEach(entry => {
    //   const entryKey = getValueByAmbiguousEntryName(tree, entry.text);
    //   const entryValue = translations[entryKey as string];
    //   if (entryValue === undefined) return;
    //   const range = new vscode.Range(editor.document.positionAt(entry.pos), editor.document.positionAt(entry.pos + entry.text.length));
    //   replacedRanges.push({ range });
    //   replacementTexts.push({
    //     range,
    //     renderOptions: {
    //       before: {
    //         contentText: entryValue,
    //         margin: "0 0 0 0" // 精确对齐
    //       }
    //     }
    //   });
    // });

    // // 1. 隐藏原始 key
    // editor.setDecorations(this.replacedDecoration, replacedRanges);
    // // 2. 在相同位置显示翻译文本
    // editor.setDecorations(this.replacementDecoration, replacementTexts);

    // 生成新的装饰器 Map

    entries.forEach(entry => {
      const entryKey = getValueByAmbiguousEntryName(tree, entry.text);
      const entryValue = translations[entryKey as string];
      if (entryValue === undefined) return;
      const range = new vscode.Range(editor.document.positionAt(entry.pos), editor.document.positionAt(entry.pos + entry.text.length));
      const uniqueId = `${entry.pos}:${entry.id}`;

      const translationDec: vscode.DecorationOptions = {
        range,
        renderOptions: {
          before: {
            contentText: entryValue
          }
        }
      };

      // 创建隐藏原始 key 的装饰器
      const hiddenKeyDec: vscode.DecorationOptions = { range };

      // 保存状态
      this.currentDecorations.set(uniqueId, { translationDec, hiddenKeyDec });
    });

    // 应用新装饰器
    this.applyDecorations(editor);
  }

  // 应用装饰器（根据光标位置切换状态）
  private applyDecorations(editor: vscode.TextEditor): void {
    if (!this.currentEditor) return;

    const cursorLine = this.currentEditor.selection.active.line;
    const translationDecorations: vscode.DecorationOptions[] = [];
    const hiddenKeyDecorations: vscode.DecorationOptions[] = [];

    this.currentDecorations.forEach(({ translationDec, hiddenKeyDec }) => {
      const isOnCursorLine = translationDec.range.start.line <= cursorLine && translationDec.range.end.line >= cursorLine;

      if (isOnCursorLine) {
        // 光标所在行：显示原始 key，隐藏翻译
        hiddenKeyDecorations.push(hiddenKeyDec);
      } else {
        // 其他行：显示翻译，隐藏原始 key
        translationDecorations.push(translationDec);
        hiddenKeyDecorations.push(hiddenKeyDec);
      }
    });

    // 设置装饰器
    editor.setDecorations(this.translationDecoration, translationDecorations);
    editor.setDecorations(this.hiddenKeyDecoration, hiddenKeyDecorations);
  }

  // 处理光标移动
  private handleCursorMove(event: vscode.TextEditorSelectionChangeEvent): void {
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
  private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (event.contentChanges.length === 0) return;

    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === event.document) {
      // 只更新受影响的区域
      const changedLines = new Set<number>();
      event.contentChanges.forEach(change => {
        const startLine = change.range.start.line;
        const endLine = change.range.end.line;
        for (let i = startLine; i <= endLine; i++) {
          changedLines.add(i);
        }
      });
    }
  }

  // 清空所有装饰器
  private clearAllDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.translationDecoration, []);
    editor.setDecorations(this.hiddenKeyDecoration, []);
    this.currentDecorations.clear();
  }

  dispose(): void {
    this.disposables.forEach(d => {
      d.dispose();
    });
    this.translationDecoration.dispose();
    this.hiddenKeyDecoration.dispose();
    this.currentDecorations.clear();
  }
}
