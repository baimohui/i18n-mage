import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { formatEscapeChar, unescapeString, unFormatEscapeChar } from "@/utils/regex";

export function registerEditValueCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.editValue",
    async (e?: { name: string; key: string; description: string; meta: { scope: string } }) => {
      let target: { name: string; key: string; value: string; lang: string } | undefined = undefined;
      const dictionary = mage.langDetail.dictionary;
      if (e === undefined) {
        const key = await vscode.window.showQuickPick(Object.keys(dictionary), {
          canPickMany: false,
          placeHolder: t("command.editValue.selectEntry")
        });
        if (key === undefined) return;
        const lang = await vscode.window.showQuickPick(mage.langDetail.langList, {
          canPickMany: false,
          placeHolder: t("command.editValue.selectLang")
        });
        if (lang === undefined) return;
        const value = dictionary?.[key]?.value?.[lang] ?? "";
        target = { name: unescapeString(key), key, value, lang };
      } else {
        target = {
          name: e.name,
          key: e.key,
          value: dictionary?.[e.key]?.value?.[e.meta.scope] ?? "",
          lang: e.meta.scope
        };
      }
      if (target === undefined) return;
      NotificationManager.showTitle(t("command.modify.title"));
      const { name, value, lang } = target;
      const newValue = await vscode.window.showInputBox({
        prompt: t("command.editValue.prompt", name, lang),
        value: formatEscapeChar(value)
      });
      if (typeof newValue === "string" && newValue !== value && newValue.trim() !== "") {
        mage.setOptions({ task: "modify", modifyList: [{ ...target, value: unFormatEscapeChar(newValue) }] });
        const res = await mage.execute();
        if (res.success) {
          if (e) e.description = newValue;
          if (!value) {
            await mage.execute({ task: "check", globalFlag: false });
            mage.setOptions({ globalFlag: true });
          }
          treeInstance.refresh();
          res.defaultSuccessMessage = t("command.editValue.success", newValue);
          NotificationManager.showResult(res);
        }
      }
    }
  );

  registerDisposable(disposable);
}
