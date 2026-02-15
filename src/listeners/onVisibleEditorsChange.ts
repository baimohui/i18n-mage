import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { debounce } from "@/utils/common";

export function registerOnVisibleEditorsChange() {
  const decorator = DecoratorController.getInstance();
  const debouncedHandler = debounce((editors: readonly vscode.TextEditor[]) => {
    decorator.updateVisibleEditors(editors, { force: false });
  }, 200);
  const disposable = vscode.window.onDidChangeVisibleTextEditors(debouncedHandler);
  registerDisposable(decorator);
  registerDisposable(disposable);
}
