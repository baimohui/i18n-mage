import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import LangMage from "@/core/LangMage";
import { registerDisposable } from "@/utils/dispose";
import { debounce } from "@/utils/common";
import { isValidI18nCallablePath } from "@/utils/regex";

export function registerOnFileSave() {
  const debouncedHandler = debounce(async (doc: vscode.TextDocument) => {
    const filePath = doc.fileName;
    const workspacePath = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath;
    if (workspacePath === undefined || !isValidI18nCallablePath(filePath)) return;
    const mage = LangMage.getInstance();
    mage.setOptions({ task: "check", globalFlag: true, clearCache: true });
    await mage.execute();
    treeInstance.checkUsedInfo();
  }, 2000);
  const disposable = vscode.workspace.onDidSaveTextDocument(debouncedHandler);
  registerDisposable(disposable);
}
