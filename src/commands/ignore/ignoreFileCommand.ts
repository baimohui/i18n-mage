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
      const ignoredFiles = getConfig<string[]>("workspace.ignoredFiles", []);
      const filePath = toRelativePath(e.resourceUri!.fsPath);
      if (filePath !== undefined) {
        ignoredFiles.push(filePath);
        await setConfig("workspace.ignoredFiles", [...new Set(ignoredFiles)]);
        mage.setOptions({ task: "check" });
        await mage.execute();
        treeInstance.refresh();
      }
    });
  });

  registerDisposable(disposable);
}
