import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { debounce } from "@/utils/common";

export function registerOnActiveEditorChange() {
  const debouncedHandler = debounce(() => {
    if (treeInstance.isInitialized) {
      treeInstance.refresh();
    }
  }, 300);
  const disposable = vscode.window.onDidChangeActiveTextEditor(debouncedHandler);
  registerDisposable(disposable);
}
