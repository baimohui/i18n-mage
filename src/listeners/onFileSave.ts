import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import LangMage from "@/core/LangMage";
import { isPathInsideDirectory } from "@/utils/fs";
import { registerDisposable } from "@/utils/dispose";

export function registerOnFileSave() {
  const disposable = vscode.workspace.onDidSaveTextDocument(async doc => {
    console.log("文件保存：", doc.fileName);
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    if (isPathInsideDirectory(publicCtx.langDir, doc.fileName)) {
      console.log("isPathInsideDirectory");
    }
    mage.setOptions({ task: "check", globalFlag: true, clearCache: true });
    await mage.execute();
    treeInstance.checkUsedInfo();
  });
  registerDisposable(disposable);
}
