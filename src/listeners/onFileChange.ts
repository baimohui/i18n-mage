import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { Diagnostics } from "@/features/Diagnostics";
import { throttle } from "@/utils/common";
import { ActiveEditorState } from "@/utils/activeEditorState";

export function registerOnFileChange() {
  const decorator = DecoratorController.getInstance();
  const diagnostics = Diagnostics.getInstance();
  const throttledHandler = throttle((event: vscode.TextDocumentChangeEvent) => {
    // 只处理当前激活编辑器对应的文档
    if (vscode.window.activeTextEditor?.document !== event.document) return;
    // 过滤掉空变更（有时 diagnostics 或 decoration 也会触发）
    if (event.contentChanges.length === 0) return;
    ActiveEditorState.update(vscode.window.activeTextEditor);
    decorator.handleDocumentChange(event);
    diagnostics.update(event.document);
  }, 500);
  const disposable = vscode.workspace.onDidChangeTextDocument(throttledHandler);
  registerDisposable(decorator);
  registerDisposable(diagnostics);
  registerDisposable(disposable);
}
