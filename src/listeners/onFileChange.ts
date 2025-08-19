import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { Diagnostics } from "@/features/Diagnostics";
import { throttle } from "@/utils/common";

export function registerOnFileChange() {
  const decorator = DecoratorController.getInstance();
  const diagnostics = Diagnostics.getInstance();
  const throttledHandler = throttle((event: vscode.TextDocumentChangeEvent) => {
    decorator.handleDocumentChange(event);
    diagnostics.update(event.document);
  }, 500);
  const disposable = vscode.workspace.onDidChangeTextDocument(throttledHandler);
  registerDisposable(decorator);
  registerDisposable(diagnostics);
  registerDisposable(disposable);
}
