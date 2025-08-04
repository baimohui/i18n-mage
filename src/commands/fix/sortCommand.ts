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
      mage.setOptions({ task: "sort" });
      res = await mage.execute();
    });
    setTimeout(() => {
      if (res !== null) NotificationManager.showResult(res, t("command.sort.success"));
    }, 1000);
  });

  registerDisposable(disposable);
}
