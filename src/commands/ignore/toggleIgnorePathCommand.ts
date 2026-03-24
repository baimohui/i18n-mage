import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { getCacheConfig, setConfig } from "@/utils/config";
import { isPathInsideDirectory, toRelativePath } from "@/utils/fs";
import { getIgnoredPathsFromConfig } from "@/utils/ignorePaths";
import { IgnoredPathDecorationProvider } from "@/features/IgnoredPathDecorationProvider";
import { NotificationManager } from "@/utils/notification";

type ToggleIgnorePathTarget = vscode.Uri | vscode.TreeItem | undefined;

export function registerToggleIgnorePathCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.toggleIgnorePath", async (target: ToggleIgnorePathTarget) => {
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
        openLabel: t("command.toggleIgnorePath.openLabel")
      });
      if (selected === undefined || selected.length === 0) return;
      uri = selected[0];
    }

    const targetPath = toRelativePath(uri.fsPath);
    if (!targetPath) return;

    const ignoredPaths = getIgnoredPathsFromConfig();
    const isIgnored = ignoredPaths.includes(targetPath);

    if (!isIgnored) {
      const languagePath = getCacheConfig<string>("workspace.languagePath", "");
      if (languagePath && isPathInsideDirectory(languagePath, uri.fsPath)) {
        NotificationManager.showWarning(t("command.ignorePath.langPathBlocked"));
        return;
      }
    }

    await wrapWithProgress({ title: t("command.toggleIgnorePath.progress") }, async () => {
      const nextIgnoredPaths = isIgnored ? ignoredPaths.filter(path => path !== targetPath) : [...ignoredPaths, targetPath];
      await setConfig("workspace.ignoredPaths", [...new Set(nextIgnoredPaths)]);
      IgnoredPathDecorationProvider.getInstance().refresh(uri);
      mage.setOptions({ task: "check" });
      await mage.execute();
      treeInstance.refresh();
    });
  });

  registerDisposable(disposable);
}
