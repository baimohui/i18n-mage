import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { formatEscapeChar, unescapeString, unFormatEscapeChar } from "@/utils/regex";
import { wrapWithProgress } from "@/utils/wrapWithProgress";

export function registerRewriteEntryCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.rewriteEntry",
    async (e?: { name: string; key: string; description: string; meta: { scope: string } }) => {
      let target: { name: string; key: string; value: string; lang: string } | undefined = undefined;
      const dictionary = mage.langDetail.dictionary;
      const publicCtx = mage.getPublicContext();
      const referredLang = publicCtx.referredLang;
      if (e === undefined) {
        const key = await vscode.window.showQuickPick(Object.keys(dictionary), {
          canPickMany: false,
          placeHolder: t("command.rewriteEntry.selectEntryToRewrite")
        });
        if (key === undefined) return;
        const langList = mage.detectedLangList.filter(l => !publicCtx.ignoredLangs.includes(l));
        const referredLangIndex = langList.indexOf(referredLang);
        if (referredLangIndex > -1) {
          langList.splice(referredLangIndex, 1);
          langList.unshift(referredLang);
        }
        const lang = await vscode.window.showQuickPick(langList, { placeHolder: t("command.rename.selectSourceLanguageToRewrite") });
        if (lang === undefined) return;
        const value = dictionary?.[key]?.value?.[lang] ?? "";
        target = { name: unescapeString(key), key, value, lang };
      } else {
        target = {
          name: e.name,
          key: e.key,
          lang: e.meta.scope,
          value: dictionary?.[e.key]?.value?.[e.meta.scope] ?? ""
        };
      }
      if (target === undefined) return;
      NotificationManager.showTitle(t("command.rewriteEntry.rewriteEntry"));
      const { name, value } = target;
      const newValue = await vscode.window.showInputBox({
        prompt: t("command.rewriteEntry.rewriteValueOf0In1AndSyncToAllLanguages", name, target.lang),
        value: formatEscapeChar(value)
      });
      if (typeof newValue === "string" && newValue !== value && newValue.trim() !== "") {
        await wrapWithProgress({ title: t("command.rewriteEntry.rewriting"), cancellable: true, timeout: 1000 * 60 * 10 }, async () => {
          mage.setOptions({ task: "modify", modifyQuery: { type: "rewriteEntry", ...target, value: unFormatEscapeChar(newValue) } });
          const res = await mage.execute();
          if (res.success) {
            if (e) e.description = newValue;
            if (!value) {
              await mage.execute({ task: "check", globalFlag: false });
              mage.setOptions({ globalFlag: true });
            }
            treeInstance.refresh();
            NotificationManager.showResult(res);
          }
        });
      }
    }
  );

  registerDisposable(disposable);
}
