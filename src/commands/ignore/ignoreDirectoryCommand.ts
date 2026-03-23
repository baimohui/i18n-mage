import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { setConfig } from "@/utils/config";
import { toRelativePath } from "@/utils/fs";
import { getIgnoredPathsFromConfig } from "@/utils/ignorePaths";

export function registerIgnoreDirectoryCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.ignoreDirectory", async (uri: vscode.Uri | undefined) => {
    if (uri === undefined) {
      const folders = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: t("command.ignoreDirectory.title")
      });
      if (folders === undefined || folders.length === 0) return;
      uri = folders[0];
    }
    await wrapWithProgress({ title: t("command.ignoreFile.progress") }, async () => {
      const ignoredPaths = getIgnoredPathsFromConfig();
      const dirPath = toRelativePath(uri.fsPath);
      if (dirPath !== undefined && !ignoredPaths.includes(dirPath)) {
        ignoredPaths.push(dirPath);
        await setConfig("workspace.ignoredPaths", [...new Set(ignoredPaths)]);
        mage.setOptions({ task: "check" });
        await mage.execute();
        treeInstance.refresh();
      }
    });
  });

  registerDisposable(disposable);
}
