import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";

export function registerOnActiveEditorChange() {
  const disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
    console.log("激活编辑器变化：", editor?.document.fileName);
    if (treeInstance.isInitialized) {
      treeInstance.checkUsedInfo();
    }
  });
  registerDisposable(disposable);
}
