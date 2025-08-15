import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerExportCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.export", async () => {
    NotificationManager.showTitle(t("command.export.title"));
    const options: vscode.SaveDialogOptions = {
      saveLabel: t("command.export.dialogTitle"),
      filters: {
        "Excel files": ["xlsx", "xls"]
      }
    };
    const fileUri = await vscode.window.showSaveDialog(options);
    if (fileUri) {
      await wrapWithProgress({ title: t("command.export.progress") }, async () => {
        const filePath = fileUri.fsPath;
        mage.setOptions({ task: "export", exportExcelTo: filePath });
        const res = await mage.execute();
        setTimeout(() => {
          NotificationManager.showResult(res, t("command.export.success"));
        }, 1000);
      });
    }
  });

  registerDisposable(disposable);
}
