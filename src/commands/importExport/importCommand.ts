import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { PluginConfiguration } from "@/types";
import previewFixContent from "@/views/previewBeforeFix";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerImportCommand() {
  const mage = LangMage.getInstance();
  const config = vscode.workspace.getConfiguration("i18n-mage") as PluginConfiguration;
  const disposable = vscode.commands.registerCommand("i18nMage.import", async () => {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: t("command.import.dialogTitle"),
      filters: {
        "Excel files": ["xlsx", "xls"]
      }
    };
    const fileUri = await vscode.window.showOpenDialog(options);
    if (Array.isArray(fileUri) && fileUri.length > 0) {
      await wrapWithProgress({ title: t("command.import.progress") }, async () => {
        const rewriteFlag = !config.previewBeforeFix;
        const filePath = fileUri[0].fsPath;
        mage.setOptions({ task: "import", importExcelFrom: filePath, rewriteFlag });
        const success = await mage.execute();
        if (success) {
          if (rewriteFlag) {
            mage.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
            await mage.execute();
            NotificationManager.showSuccess(t("command.import.success"));
          } else {
            const publicCtx = mage.getPublicContext();
            const { updatedValues, patchedIds, countryMap } = mage.langDetail;
            if ([updatedValues, patchedIds].some(item => Object.keys(item).length > 0)) {
              previewFixContent(updatedValues, patchedIds, countryMap, publicCtx.referredLang, async () => {
                mage.setOptions({ task: "rewrite" });
                await mage.execute();
                mage.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
                await mage.execute();
                treeInstance.refresh();
                NotificationManager.showSuccess(t("command.import.success"));
              });
            } else {
              NotificationManager.showWarning(t("command.import.nullWarn"));
            }
          }
        }
      });
    }
  });

  registerDisposable(disposable);
}
