import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

type ExcelAction = "i18nMage.export" | "i18nMage.import" | "i18nMage.exportDiff" | "i18nMage.importDiff";

export function registerExcelCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.excel", async () => {
    NotificationManager.showTitle(t("command.excel.title"));

    const options: Array<{ label: string; command: ExcelAction }> = [
      { label: t("command.export.title"), command: "i18nMage.export" },
      { label: t("command.exportDiff.title"), command: "i18nMage.exportDiff" },
      { label: t("command.import.title"), command: "i18nMage.import" },
      { label: t("command.importDiff.title"), command: "i18nMage.importDiff" }
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: t("command.excel.selectAction")
    });

    if (!selected) {
      return;
    }

    await vscode.commands.executeCommand(selected.command);
  });

  registerDisposable(disposable);
}
