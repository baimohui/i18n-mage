import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { setConfig } from "@/utils/config";
import LangMage from "@/core/LangMage";
import { t } from "@/utils/i18n";
import { getLangText } from "@/utils/langKey";

export function registerSetDisplayLangCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.setDisplayLang", async (lang: { key: string } | undefined) => {
    let target: string | undefined = undefined;
    if (lang) {
      target = lang.key;
    } else {
      const publicCtx = mage.getPublicContext();
      const langList = mage.detectedLangList.filter(l => !publicCtx.ignoredLangs.includes(l));
      const quickPickItems: vscode.QuickPickItem[] = langList.map(item => ({
        label: item,
        description: getLangText(item)
      }));
      const picked = await vscode.window.showQuickPick(quickPickItems, { placeHolder: t("command.pick.selectDisplayLang") });
      target = picked?.label;
    }
    if (target !== undefined) {
      await wrapWithProgress({ title: "" }, async () => {
        await setConfig("general.displayLanguage", target);
        treeInstance.refresh();
      });
    }
  });

  registerDisposable(disposable);
}
