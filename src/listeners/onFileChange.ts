import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { Diagnostics } from "@/features/Diagnostics";
import { debounce } from "@/utils/common";

export function registerOnFileChange() {
  const decorator = DecoratorController.getInstance();
  const diagnostics = Diagnostics.getInstance();
  const debouncedHandler = debounce((event: vscode.TextDocumentChangeEvent) => {
    decorator.handleDocumentChange(event);
    diagnostics.update(event.document);
  }, 500);
  const disposable = vscode.workspace.onDidChangeTextDocument(debouncedHandler);
  registerDisposable(decorator);
  registerDisposable(diagnostics);
  registerDisposable(disposable);
}
