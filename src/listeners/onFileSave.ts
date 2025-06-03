import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import LangMage from "@/core/LangMage";
import { isPathInsideDirectory } from "@/utils/fs";
import { registerDisposable } from "@/utils/dispose";
import { debounce } from "@/utils/common";

export function registerOnFileSave() {
  const debouncedHandler = debounce(async (doc: vscode.TextDocument) => {
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    if (isPathInsideDirectory(publicCtx.langDir, doc.fileName)) {
      console.log("isPathInsideDirectory");
    }
    mage.setOptions({ task: "check", globalFlag: true, clearCache: true });
    await mage.execute();
    treeInstance.checkUsedInfo();
  }, 2000);
  const disposable = vscode.workspace.onDidSaveTextDocument(debouncedHandler);
  registerDisposable(disposable);
}
