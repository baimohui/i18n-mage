import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { LANG_CODE_MAPPINGS, getLangIntro } from "@/utils/langKey";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerMarkAsKnownLangCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.markAsKnownLang", async ({ key: langKey }: { key: string }) => {
    try {
      const reverseMap: Record<string, string> = {};
      const languageList = Object.entries(LANG_CODE_MAPPINGS)
        .map(([key, info]) => {
          reverseMap[info.cnName] = key;
          return info.cnName;
        })
        .filter(cnName => mage.detectedLangList.every(i => getLangIntro(i)?.cnName !== cnName));
      const selectedText = await vscode.window.showQuickPick(languageList, {
        placeHolder: t("command.markAsKnownLang.title", langKey)
      });
      if (typeof selectedText === "string" && selectedText.trim()) {
        const selectedKey = reverseMap[selectedText];
        const config = vscode.workspace.getConfiguration("i18n-mage");
        const mappings = config.get<Record<string, string[]>>("langAliasCustomMappings") || {};
        const aliases = new Set(mappings[selectedKey] ?? []);
        if (!aliases.has(langKey)) {
          aliases.add(langKey);
          await config.update(
            "langAliasCustomMappings",
            { ...mappings, [selectedKey]: Array.from(aliases) },
            vscode.ConfigurationTarget.Global
          );
          NotificationManager.showSuccess(t("command.markAsKnownLang.success", langKey, selectedText));
        } else {
          NotificationManager.showWarning(t("command.markAsKnownLang.existedWarn", langKey, selectedText));
        }
      }
    } catch (err) {
      NotificationManager.showError(t("command.markAsKnownLang.error", err instanceof Error ? err.message : t("common.unknownError")));
    }
  });

  registerDisposable(disposable);
}
