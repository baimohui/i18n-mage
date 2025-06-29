import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { setConfig } from "@/utils/config";
import { t } from "@/utils/i18n";
import { isLikelyProjectRoot } from "@/utils/fs";
import { NotificationManager } from "@/utils/notification";

export function registerSetProjectRootCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.setProjectRoot", async (uri: vscode.Uri) => {
    await wrapWithProgress({ title: "" }, async () => {
      const folderPath = uri.fsPath;
      if (!(await isLikelyProjectRoot(folderPath))) {
        NotificationManager.showWarning(t("command.setProjectRoot.invalidFolder"));
        return;
      }
      mage.setOptions({ task: "check", rootPath: folderPath, globalFlag: true, clearCache: true });
      await mage.execute();
      await setConfig("projectRoot", folderPath);
      treeInstance.refresh();
      const decorator = DecoratorController.getInstance();
      decorator.update(vscode.window.activeTextEditor);
    });
  });

  registerDisposable(disposable);
}
