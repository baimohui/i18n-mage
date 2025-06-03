import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { debounce } from "@/utils/common";

export function registerOnActiveEditorChange() {
  const decorator = DecoratorController.getInstance();
  const debouncedHandler = debounce((editor: vscode.TextEditor | undefined) => {
    if (editor) {
      decorator.update(editor);
    }
    if (treeInstance.isInitialized) {
      treeInstance.checkUsedInfo();
    }
  }, 300);
  const disposable = vscode.window.onDidChangeActiveTextEditor(debouncedHandler);
  registerDisposable(decorator);
  registerDisposable(disposable);
}
