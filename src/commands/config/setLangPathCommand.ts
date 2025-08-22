import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { setConfig } from "@/utils/config";
import { toRelativePath } from "@/utils/fs";

export function registerSetLangPathCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.setLangPath", async (uri: vscode.Uri) => {
    await wrapWithProgress({ title: "" }, async () => {
      const langPath = uri.fsPath;
      mage.setOptions({ langPath, task: "check" });
      await mage.execute();
      if (mage.detectedLangList.length === 0) {
        NotificationManager.showWarning(t("command.selectLangPath.error"));
        vscode.commands.executeCommand("setContext", "hasValidLangPath", false);
      } else {
        const relativeLangPath = toRelativePath(langPath);
        NotificationManager.showSuccess(t("command.selectLangPath.success", relativeLangPath));
        vscode.commands.executeCommand("setContext", "hasValidLangPath", true);
        await setConfig("workspace.languagePath", relativeLangPath);
        treeInstance.refresh();
      }
    });
  });

  registerDisposable(disposable);
}
