import * as vscode from "vscode";
import { formatForFile, unescapeString } from "@/utils/regex";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";

export function registerCopyKeyValueCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.copyKeyValue",
    async (e: vscode.TreeItem & { data: { name: string; value: string }[] | undefined }) => {
      let target: { name: string; value: string }[] = [];
      if (e === undefined) {
        const dictionary = mage.langDetail.dictionary;
        const keys = await vscode.window.showQuickPick(Object.keys(dictionary), {
          canPickMany: true,
          placeHolder: t("command.copyKeyValue.selectEntry")
        });
        if (keys === undefined || keys.length === 0) return;
        const lang = await vscode.window.showQuickPick(mage.langDetail.langList, {
          canPickMany: false,
          placeHolder: t("command.copyKeyValue.selectLang")
        });
        if (lang === undefined) return;
        target = keys.map(key => ({ name: unescapeString(key), value: dictionary[key]?.[lang] ?? "" }));
      } else {
        target = e.data ?? [];
      }
      const content = target.map(i => `${formatForFile(i.name)}: ${formatForFile(i.value)},`).join("\n");
      await vscode.env.clipboard.writeText(content);
      NotificationManager.showSuccess(t("command.copy.success", content));
    }
  );

  registerDisposable(disposable);
}
