import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { debounce } from "@/utils/common";

export function registerOnFileChange() {
  const decorator = DecoratorController.getInstance();
  const debouncedHandler = debounce((event: vscode.TextDocumentChangeEvent) => {
    decorator.handleDocumentChange(event);
  }, 200);
  const disposable = vscode.workspace.onDidChangeTextDocument(debouncedHandler);
  registerDisposable(decorator);
  registerDisposable(disposable);
}
