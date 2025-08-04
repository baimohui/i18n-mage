import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { setConfig } from "@/utils/config";
import { t } from "@/utils/i18n";
import { isLikelyProjectPath, toRelativePath } from "@/utils/fs";
import { NotificationManager } from "@/utils/notification";

export function registerSetProjectPathCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.setProjectPath", async (uri: vscode.Uri) => {
    await wrapWithProgress({ title: "" }, async () => {
      const projectPath = uri.fsPath;
      if (!(await isLikelyProjectPath(projectPath))) {
        NotificationManager.showWarning(t("command.setProjectPath.invalidFolder"));
        return;
      }
      mage.setOptions({ task: "check", projectPath });
      await mage.execute();
      await setConfig("workspace.projectPath", toRelativePath(projectPath));
      treeInstance.refresh();
    });
  });

  registerDisposable(disposable);
}
