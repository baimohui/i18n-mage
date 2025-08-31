import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { LANG_CODE_MAPPINGS, getLangCode, getLangIntro } from "@/utils/langKey";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig, setConfig } from "@/utils/config";

export function registerMarkAsKnownLangCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.markAsKnownLang", async (lang: { key: string } | undefined) => {
    try {
      let target: string | undefined = undefined;
      const reverseMap: Record<string, string> = {};
      const publicCtx = mage.getPublicContext();
      if (lang) {
        target = lang.key;
      } else {
        const unknownLangs = mage.detectedLangList.filter(l => getLangCode(l) == null);
        if (unknownLangs.length > 0) {
          target = await vscode.window.showQuickPick(unknownLangs, { placeHolder: t("command.pick.selectLang") });
        } else {
          NotificationManager.showWarning(t("command.markAsKnownLang.noUnknownLang"));
        }
      }
      if (target !== undefined) {
        const nameKey = getLangCode(publicCtx.defaultLang) === "zh-CN" ? "cnName" : "enName";
        const languageList = Object.entries(LANG_CODE_MAPPINGS)
          .map(([key, info]) => {
            reverseMap[info[nameKey]] = key;
            return info[nameKey];
          })
          .filter(name => mage.detectedLangList.every(i => getLangIntro(i)?.[nameKey] !== name));
        const selectedText = await vscode.window.showQuickPick(languageList, {
          placeHolder: t("command.markAsKnownLang.title", target)
        });
        if (typeof selectedText === "string" && selectedText.trim()) {
          const selectedKey = reverseMap[selectedText];
          const mappings = getConfig<Record<string, string[]>>("translationServices.langAliasCustomMappings", {});
          const aliases = new Set(mappings[selectedKey] ?? []);
          if (!aliases.has(target)) {
            aliases.add(target);
            await setConfig("translationServices.langAliasCustomMappings", { ...mappings, [selectedKey]: Array.from(aliases) }, "global");
            treeInstance.refresh();
            NotificationManager.showSuccess(t("command.markAsKnownLang.success", target, selectedText));
          } else {
            NotificationManager.showWarning(t("command.markAsKnownLang.existedWarn", target, selectedText));
          }
        }
      }
    } catch (err) {
      NotificationManager.showError(t("command.markAsKnownLang.error", err instanceof Error ? err.message : t("common.unknownError")));
    }
  });

  registerDisposable(disposable);
}
