import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";

export function registerOnActiveEditorChange() {
  const decorator = DecoratorController.getInstance();
  const disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (treeInstance.isInitialized) {
      treeInstance.checkUsedInfo();
    }
    if (editor) {
      decorator.update(editor);
    }
  });
  registerDisposable(decorator);
  registerDisposable(disposable);
}
