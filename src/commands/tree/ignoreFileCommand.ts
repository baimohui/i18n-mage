import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { getConfig, setConfig } from "@/utils/config";
import { toRelativePath } from "@/utils/fs";

export function registerIgnoreFileCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.ignoreFile", async (e: vscode.TreeItem) => {
    await wrapWithProgress({ title: t("command.ignoreFile.progress") }, async () => {
      const ignoredFileList = getConfig<string[]>("ignoredFileList", []);
      const filePath = toRelativePath(e.resourceUri!.fsPath);
      if (filePath !== undefined) {
        ignoredFileList.push(filePath);
        await setConfig("ignoredFileList", ignoredFileList);
        mage.setOptions({ task: "check", globalFlag: true, clearCache: true });
        await mage.execute();
        treeInstance.refresh();
      }
    });
  });

  registerDisposable(disposable);
}
