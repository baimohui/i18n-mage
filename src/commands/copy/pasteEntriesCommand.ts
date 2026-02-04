import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";
import { EditValueQuery } from "@/types";
import { treeInstance } from "@/views/tree";

export function registerPasteEntriesCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.pasteEntries", async () => {
    const { dictionary } = mage.langDetail;
    const targetText = await vscode.env.clipboard.readText();
    try {
      const target = JSON.parse(targetText) as Record<string, Record<string, string>>;
      const entries = Object.entries(target);
      const data: EditValueQuery["data"] = [];
      if (entries.length > 0) {
        const existedKeys = entries.map(([key, _]) => key).filter(key => Object.hasOwn(dictionary, key));
        let skipExistedKeys = false;
        if (existedKeys.length > 0) {
          const confirm = await vscode.window.showWarningMessage(
            t("command.pasteEntries.confirm", existedKeys.length),
            { modal: true },
            t("command.pasteEntries.confirm.overwrite"),
            t("command.pasteEntries.confirm.skip")
          );
          if (confirm === t("command.pasteEntries.confirm.skip")) {
            skipExistedKeys = true;
          } else if (confirm !== t("command.pasteEntries.confirm.overwrite")) {
            return;
          }
        }
        entries.forEach(([key, translation]) => {
          if (skipExistedKeys && Object.hasOwn(dictionary, key)) {
            return;
          }
          for (const [lang, value] of Object.entries(translation)) {
            data.push({ key, value, lang });
          }
        });
        if (data.length > 0) {
          await mage.execute({ task: "modify", modifyQuery: { type: "editValue", data } });
          NotificationManager.showSuccess(
            t("command.pasteEntries.success", skipExistedKeys ? entries.length - existedKeys.length : entries.length)
          );
          await mage.execute({ task: "check", globalFlag: true });
          treeInstance.refresh();
          return;
        }
      }
      NotificationManager.showWarning(t("command.pasteEntries.empty"));
    } catch (error) {
      console.error(error);
      NotificationManager.showWarning(t("command.pasteEntries.error", targetText));
    }
  });

  registerDisposable(disposable);
}
