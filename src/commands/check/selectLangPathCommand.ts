import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerSelectLangPathCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.selectLangPath", async () => {
    const selectedUri = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      openLabel: t("command.selectLangPath.title"),
      canSelectMany: false
    });
    if (selectedUri && selectedUri.length > 0) {
      await wrapWithProgress({ title: t("command.check.progress") }, async () => {
        const langPath = selectedUri[0].fsPath;
        mage.setOptions({ langPath, task: "check", globalFlag: true, clearCache: true });
        await mage.execute();
        if (mage.detectedLangList.length === 0) {
          NotificationManager.showWarning(t("command.selectLangPath.error"));
          vscode.commands.executeCommand("setContext", "hasValidLangPath", false);
        } else {
          vscode.window.showInformationMessage(t("command.selectLangPath.success", langPath));
          vscode.commands.executeCommand("setContext", "hasValidLangPath", true);
          treeInstance.refresh();
          const decorator = DecoratorController.getInstance();
          decorator.update(vscode.window.activeTextEditor);
        }
      });
    }
  });

  registerDisposable(disposable);
}
