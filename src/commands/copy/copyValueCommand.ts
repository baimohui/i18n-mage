import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";

export function registerCopyValueCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.copyValue", async (e: vscode.TreeItem | undefined) => {
    let target = "";
    if (e === undefined || typeof e.description !== "string" || e.description.trim() === "") {
      const dictionary = mage.langDetail.dictionary;
      const key = await vscode.window.showQuickPick(Object.keys(dictionary), {
        canPickMany: false,
        placeHolder: t("command.copyValue.selectEntry")
      });
      if (key === undefined) return;
      const lang = await vscode.window.showQuickPick(mage.langDetail.langList, {
        canPickMany: false,
        placeHolder: t("command.copyValue.selectLang")
      });
      if (lang === undefined) return;
      target = dictionary?.[key]?.[lang] ?? "";
    } else {
      target = e.description;
    }
    await vscode.env.clipboard.writeText(String(target));
    NotificationManager.showSuccess(t("command.copy.success", target));
  });

  registerDisposable(disposable);
}
