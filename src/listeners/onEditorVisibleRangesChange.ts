import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { debounce } from "@/utils/common";
import { ActiveEditorState } from "@/utils/activeEditorState";

export function registerOnEditorVisibleRangesChange() {
  const decorator = DecoratorController.getInstance();
  const debouncedHandler = debounce((event: vscode.TextEditorVisibleRangesChangeEvent) => {
    ActiveEditorState.updateVisibleEntries(event.textEditor);
    decorator.handleVisibleRangesChange(event);
  }, 200);
  const disposable = vscode.window.onDidChangeTextEditorVisibleRanges(debouncedHandler);
  registerDisposable(decorator);
  registerDisposable(disposable);
}
