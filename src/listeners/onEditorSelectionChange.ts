import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";

export function registerOnEditorSelectionChange() {
  const decorator = DecoratorController.getInstance();
  const disposable = vscode.window.onDidChangeTextEditorSelection(event => {
    decorator.handleCursorMove(event);
  });
  registerDisposable(decorator);
  registerDisposable(disposable);
}
