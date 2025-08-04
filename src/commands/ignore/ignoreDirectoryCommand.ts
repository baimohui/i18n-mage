import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { getConfig, setConfig } from "@/utils/config";
import { toRelativePath } from "@/utils/fs";

export function registerIgnoreDirectoryCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.ignoreDirectory", async (uri: vscode.Uri) => {
    await wrapWithProgress({ title: t("command.ignoreFile.progress") }, async () => {
      const ignoredDirectories = getConfig<string[]>("workspace.ignoredDirectories", []);
      const dirPath = toRelativePath(uri.fsPath);
      if (dirPath !== undefined) {
        ignoredDirectories.push(dirPath);
        await setConfig("workspace.ignoredDirectories", [...new Set(ignoredDirectories)]);
        mage.setOptions({ task: "check" });
        await mage.execute();
        treeInstance.refresh();
      }
    });
  });

  registerDisposable(disposable);
}
