import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerSetLangDirCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.setLangDir", async (uri: vscode.Uri) => {
    await wrapWithProgress({ title: "" }, async () => {
      const langDir = uri.fsPath;
      mage.setOptions({ langDir, task: "check", globalFlag: true, clearCache: true });
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
  });

  registerDisposable(disposable);
}
