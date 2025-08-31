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
  const disposable = vscode.commands.registerCommand("i18nMage.ignoreFile", async (e: vscode.TreeItem | undefined) => {
    let target: string | undefined = undefined;
    if (e === undefined) {
      const folders = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: t("command.ignoreFile.openLabel")
      });
      if (folders === undefined || folders.length === 0) return;
      target = toRelativePath(folders[0].fsPath);
    } else {
      target = toRelativePath(e.resourceUri!.fsPath);
    }
    if (target === undefined) return;
    await wrapWithProgress({ title: t("command.ignoreFile.progress") }, async () => {
      const ignoredFiles = getConfig<string[]>("workspace.ignoredFiles", []);
      if (target !== undefined && !ignoredFiles.includes(target)) {
        ignoredFiles.push(target);
        await setConfig("workspace.ignoredFiles", [...new Set(ignoredFiles)]);
        mage.setOptions({ task: "check" });
        await mage.execute();
        treeInstance.refresh();
      }
    });
  });

  registerDisposable(disposable);
}
