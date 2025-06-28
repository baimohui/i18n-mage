import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerSelectLangDirCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.selectLangDir", async () => {
    const selectedUri = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      openLabel: t("command.selectLangDir.title"),
      canSelectMany: false
    });
    if (selectedUri && selectedUri.length > 0) {
      await wrapWithProgress({ title: t("command.check.progress") }, async () => {
        const langDir = selectedUri[0].fsPath;
        mage.setOptions({ langDir, task: "check", globalFlag: true, clearCache: false });
        await mage.execute();
        if (mage.detectedLangList.length === 0) {
          NotificationManager.showWarning(t("command.selectLangDir.error"));
          vscode.commands.executeCommand("setContext", "hasValidLangDir", false);
        } else {
          vscode.window.showInformationMessage(t("command.selectLangDir.success", langDir));
          vscode.commands.executeCommand("setContext", "hasValidLangDir", true);
          treeInstance.refresh();
          const decorator = DecoratorController.getInstance();
          decorator.update(vscode.window.activeTextEditor);
        }
      });
    }
  });

  registerDisposable(disposable);
}
