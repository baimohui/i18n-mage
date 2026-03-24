import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { setConfig } from "@/utils/config";
import { toRelativePath } from "@/utils/fs";
import { getIgnoredPathsFromConfig } from "@/utils/ignorePaths";

type IgnorePathTarget = vscode.Uri | vscode.TreeItem | undefined;

export function registerIgnorePathCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.ignorePath", async (target: IgnorePathTarget) => {
    let uri: vscode.Uri | undefined = undefined;

    if (target instanceof vscode.Uri) {
      uri = target;
    } else if (target?.resourceUri) {
      uri = target.resourceUri;
    }

    if (!uri) {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: t("command.ignorePath.openLabel")
      });
      if (selected === undefined || selected.length === 0) return;
      uri = selected[0];
    }

    const targetPath = toRelativePath(uri.fsPath);
    if (!targetPath) return;

    await wrapWithProgress({ title: t("command.ignorePath.progress") }, async () => {
      const ignoredPaths = getIgnoredPathsFromConfig();
      if (!ignoredPaths.includes(targetPath)) {
        ignoredPaths.push(targetPath);
        await setConfig("workspace.ignoredPaths", [...new Set(ignoredPaths)]);
        mage.setOptions({ task: "check" });
        await mage.execute();
        treeInstance.refresh();
      }
    });
  });

  registerDisposable(disposable);
}
