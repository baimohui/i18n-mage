import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import LangMage from "@/core/LangMage";
import { registerDisposable } from "@/utils/dispose";
import { debounce } from "@/utils/common";
import { isValidI18nCallablePath } from "@/utils/regex";
import { isPathInsideDirectory } from "@/utils/fs";
import { getCacheConfig } from "@/utils/config";

export function registerOnFileSave() {
  const debouncedHandler = debounce(async (doc: vscode.TextDocument) => {
    const filePath = doc.fileName;
    const workspacePath = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath;
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    const { analysisOnSave } = getCacheConfig();
    if (
      !analysisOnSave ||
      workspacePath === undefined ||
      (!isValidI18nCallablePath(filePath) && !isPathInsideDirectory(publicCtx.langPath, filePath))
    )
      return;
    mage.setOptions({ task: "check" });
    await mage.execute();
    treeInstance.checkUsedInfo();
  }, 2000);
  const disposable = vscode.workspace.onDidSaveTextDocument(debouncedHandler);
  registerDisposable(disposable);
}
