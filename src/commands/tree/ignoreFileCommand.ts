import path from "path";
import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { PluginConfiguration } from "@/types";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";

export function registerIgnoreFileCommand() {
  const mage = LangMage.getInstance();
  const globalConfig = vscode.workspace.getConfiguration();
  const disposable = vscode.commands.registerCommand("i18nMage.ignoreFile", (e: vscode.TreeItem) => {
    wrapWithProgress({
      title: "刷新中...",
      callback: async () => {
        const publicCtx = mage.getPublicContext();
        const config = vscode.workspace.getConfiguration("i18n-mage") as PluginConfiguration;
        const ignoredFileList = (config.ignoredFileList ?? []).concat(path.relative(publicCtx.rootPath, e.resourceUri!.fsPath));
        await globalConfig.update("i18n-mage.ignoredFileList", ignoredFileList, vscode.ConfigurationTarget.Workspace);
        mage.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList });
        const res = await mage.execute();
        if (!res) {
          await treeInstance.initTree();
        }
      }
    });
  });

  registerDisposable(disposable);
}
