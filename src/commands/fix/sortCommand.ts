import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { ExecutionResult } from "@/types";

export function registerSortCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.sort", async () => {
    let res: ExecutionResult | null = null;
    await wrapWithProgress({ title: t("command.sort.progress") }, async () => {
      res = await mage.execute({ task: "sort" });
    });
    setTimeout(() => {
      if (res !== null) {
        res.defaultSuccessMessage = t("command.sort.success");
        NotificationManager.showResult(res);
      }
    }, 1000);
  });

  registerDisposable(disposable);
}
