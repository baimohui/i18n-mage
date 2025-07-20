import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { setConfig } from "@/utils/config";
import { toRelativePath } from "@/utils/fs";

export function registerSetLangPathCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.setLangPath", async (uri: vscode.Uri) => {
    await wrapWithProgress({ title: "" }, async () => {
      const langPath = uri.fsPath;
      mage.setOptions({ langPath, task: "check", globalFlag: true, clearCache: true });
      await mage.execute();
      if (mage.detectedLangList.length === 0) {
        NotificationManager.showWarning(t("command.selectLangPath.error"));
        vscode.commands.executeCommand("setContext", "hasValidLangPath", false);
      } else {
        vscode.window.showInformationMessage(t("command.selectLangPath.success", langPath));
        vscode.commands.executeCommand("setContext", "hasValidLangPath", true);
        await setConfig("workspace.languagePath", toRelativePath(langPath));
        treeInstance.refresh();
        const decorator = DecoratorController.getInstance();
        decorator.update(vscode.window.activeTextEditor);
      }
    });
  });

  registerDisposable(disposable);
}
