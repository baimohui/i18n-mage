import * as vscode from "vscode";
import { formatForFile, getValueByAmbiguousEntryName, unescapeString } from "@/utils/regex";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";

export function registerCopyKeyValueCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.copyKeyValue", async (e: vscode.Uri | undefined) => {
    const { dictionary, tree } = mage.langDetail;
    let target: { name: string; value: string }[] = [];
    if (e === undefined) {
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
      target = keys.map(key => ({ name: unescapeString(key), value: dictionary[key]?.value?.[lang] ?? "" }));
    } else {
      target = treeInstance.definedEntriesInCurrentFile.map(item => {
        const key = getValueByAmbiguousEntryName(tree, item.nameInfo.name) as string;
        return {
          name: item.nameInfo.name,
          value: dictionary[key].value[treeInstance.displayLang] ?? ""
        };
      });
    }
    const content = target.map(i => `${formatForFile(i.name)}: ${formatForFile(i.value)},`).join("\n");
    await vscode.env.clipboard.writeText(content);
    NotificationManager.showSuccess(t("command.copy.success", content));
  });

  registerDisposable(disposable);
}
