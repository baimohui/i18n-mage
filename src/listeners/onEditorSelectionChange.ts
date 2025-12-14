import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { debounce } from "@/utils/common";
import { ActiveEditorState } from "@/utils/activeEditorState";

export function registerOnEditorSelectionChange() {
  const decorator = DecoratorController.getInstance();
  const debouncedHandler = debounce((event: vscode.TextEditorSelectionChangeEvent) => {
    decorator.handleCursorMove(event);
    const editor = event.textEditor;
    ActiveEditorState.updateKeyAtCursor(editor);
  }, 200);
  const disposable = vscode.window.onDidChangeTextEditorSelection(debouncedHandler);
  registerDisposable(decorator);
  registerDisposable(disposable);
}
