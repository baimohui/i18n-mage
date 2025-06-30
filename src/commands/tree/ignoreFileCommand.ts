import path from "path";
import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { getConfig, setConfig } from "@/utils/config";

export function registerIgnoreFileCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.ignoreFile", async (e: vscode.TreeItem) => {
    await wrapWithProgress({ title: t("command.ignoreFile.progress") }, async () => {
      const publicCtx = mage.getPublicContext();
      const ignoredFileList = getConfig<string[]>("ignoredFileList", []).concat(path.relative(publicCtx.rootPath, e.resourceUri!.fsPath));
      await setConfig("ignoredFileList", ignoredFileList);
      mage.setOptions({ task: "check", globalFlag: true, clearCache: true });
      await mage.execute();
      treeInstance.refresh();
    });
  });

  registerDisposable(disposable);
}
