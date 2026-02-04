import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";
import { unescapeString } from "@/utils/regex";

export function registerCopyNameCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.copyName", async (e: vscode.TreeItem | undefined) => {
    let target = "";
    if (e === undefined || typeof e.label !== "string" || e.label.trim() === "") {
      const dictionary = mage.langDetail.dictionary;
      const key = await vscode.window.showQuickPick(Object.keys(dictionary), {
        canPickMany: false,
        placeHolder: t("command.copyName.selectEntry")
      });
      if (key === undefined) return;
      target = unescapeString(key);
    } else {
      target = e.label;
    }
    await vscode.env.clipboard.writeText(target);
    NotificationManager.setStatusBarMessage(t("command.copy.success", target));
  });

  registerDisposable(disposable);
}
