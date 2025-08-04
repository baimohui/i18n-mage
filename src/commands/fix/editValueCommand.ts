import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerEditValueCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.editValue",
    async (e: vscode.TreeItem & { data: { name: string; key: string; value: string; lang: string } }) => {
      if (typeof e.data !== "object" || Object.keys(e.data).length === 0) return;
      NotificationManager.showTitle(t("command.modify.title"));
      const { name, value, lang } = e.data;
      const newValue = await vscode.window.showInputBox({
        prompt: t("command.editValue.prompt", name, lang),
        value
      });
      if (typeof newValue === "string" && newValue !== value && newValue.trim() !== "") {
        mage.setOptions({ task: "modify", modifyList: [{ ...e.data, value: newValue }] });
        const res = await mage.execute();
        if (res.success) {
          e.description = newValue;
          treeInstance.refresh();
          NotificationManager.showResult(res, t("command.editValue.success", newValue));
        }
      }
    }
  );

  registerDisposable(disposable);
}
