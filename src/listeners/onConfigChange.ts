import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import LangMage from "@/core/LangMage";
import { clearConfigCache } from "@/utils/config";
import { treeInstance } from "@/views/tree";
import { SORT_MODE, SortMode } from "@/types";

export function registerOnConfigChange() {
  const mage = LangMage.getInstance();
  const decorator = DecoratorController.getInstance();
  const disposable = vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration("i18n-mage")) return;
    const config = vscode.workspace.getConfiguration("i18n-mage");
    for (const type in config) {
      if (Object.prototype.toString.call(config[type]) === "[object Object]") {
        const subConfig = config[type] as vscode.WorkspaceConfiguration;
        for (const name in subConfig) {
          const key = `${type}.${name}`;
          if (event.affectsConfiguration(`i18n-mage.${key}`)) {
            clearConfigCache(key);
            if (["i18nFeatures.namespaceStrategy", "analysis.syncBasedOnReferredEntries", "analysis.scanStringLiterals"].includes(key)) {
              vscode.commands.executeCommand("i18nMage.checkUsage");
            } else if (["general.fileExtensions", "analysis.fileSizeSkipThresholdKB", "analysis.ignoreCommentedCode"].includes(key)) {
              vscode.commands.executeCommand("i18nMage.checkUsage");
            } else if (
              [
                "general.displayLanguage",
                "translationServices.validateLanguageBeforeTranslate",
                "translationServices.unmatchedLanguageAction"
              ].includes(key)
            ) {
              treeInstance.refresh();
            } else if (
              ["translationHints.maxLength", "translationHints.enableLooseKeyMatch"].includes(key) ||
              ["translationHints.light", "translationHints.dark"].some(i => key.startsWith(i))
            ) {
              decorator.updateTranslationDecoration();
            } else if (key === "writeRules.sortRule") {
              const sortMode = subConfig[name] as SortMode;
              vscode.commands.executeCommand("setContext", "allowSort", mage.langDetail.isFlat && sortMode !== SORT_MODE.None);
            }
          }
        }
      }
    }
  });
  registerDisposable(decorator);
  registerDisposable(disposable);
}
