import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { getConfig, setConfig } from "@/utils/config";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerIgnoreLangCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.ignoreLang", async (lang: { key: string } | undefined) => {
    const ignoredLangs = getConfig<string[]>("workspace.ignoredLanguages", []);
    let target: string | undefined = undefined;
    if (lang) {
      target = lang.key;
    } else {
      const publicCtx = mage.getPublicContext();
      const displayLang = getConfig<string>("general.displayLanguage");
      const langList = mage.detectedLangList.filter(l => !ignoredLangs.includes(l) && publicCtx.referredLang !== l && displayLang !== l);
      if (langList.length > 0) {
        target = await vscode.window.showQuickPick(langList, { placeHolder: t("command.pick.selectLang") });
      } else {
        NotificationManager.showWarning(t("command.ignoreLang.noIgnoredLang"));
      }
    }
    if (target !== undefined) {
      ignoredLangs.push(target);
      await setConfig("workspace.ignoredLanguages", [...new Set(ignoredLangs)]);
      mage.setOptions({ task: "check" });
      await mage.execute();
      treeInstance.refresh();
    }
  });

  registerDisposable(disposable);
}
