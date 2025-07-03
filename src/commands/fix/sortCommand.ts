import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerSortCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.sort", async () => {
    await wrapWithProgress({ title: t("command.sort.progress") }, async () => {
      mage.setOptions({ task: "sort", globalFlag: true, clearCache: false });
      const success = await mage.execute();
      if (success) {
        NotificationManager.showSuccess(t("command.sort.success"));
      }
    });
  });

  registerDisposable(disposable);
}
