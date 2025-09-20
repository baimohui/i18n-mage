import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import LangMage from "@/core/LangMage";
import { clearConfigCache, getConfig } from "@/utils/config";
import { treeInstance } from "@/views/tree";

export function registerOnConfigChange() {
  const mage = LangMage.getInstance();
  const decorator = DecoratorController.getInstance();
  const disposable = vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration("i18n-mage")) return;
    if (
      event.affectsConfiguration("i18n-mage.i18nFeatures.namespaceStrategy") ||
      event.affectsConfiguration("i18n-mage.analysis.syncBasedOnReferredEntries") ||
      event.affectsConfiguration("i18n-mage.analysis.scanStringLiterals")
    ) {
      vscode.commands.executeCommand("i18nMage.checkUsage");
    } else if (
      event.affectsConfiguration("i18n-mage.workspace") ||
      event.affectsConfiguration("i18n-mage.i18nFeatures") ||
      event.affectsConfiguration("i18n-mage.analysis.onSave") ||
      event.affectsConfiguration("i18n-mage.analysis.languageFileParser") ||
      event.affectsConfiguration("i18n-mage.writeRules.enableKeyTagRule") ||
      event.affectsConfiguration("i18n-mage.writeRules.enablePrefixTagRule")
    ) {
      clearConfigCache();
    } else if (
      event.affectsConfiguration("i18n-mage.general.fileExtensions") ||
      event.affectsConfiguration("i18n-mage.analysis.fileSizeSkipThresholdKB") ||
      event.affectsConfiguration("i18n-mage.analysis.ignoreCommentedCode")
    ) {
      clearConfigCache();
      vscode.commands.executeCommand("i18nMage.checkUsage");
    } else if (event.affectsConfiguration("i18n-mage.general.displayLanguage")) {
      treeInstance.refresh();
    } else if (
      event.affectsConfiguration("i18n-mage.translationHints.light") ||
      event.affectsConfiguration("i18n-mage.translationHints.dark") ||
      event.affectsConfiguration("i18n-mage.translationHints.maxLength") ||
      event.affectsConfiguration("i18n-mage.translationHints.enableLooseKeyMatch")
    ) {
      decorator.updateTranslationDecoration();
    } else if (event.affectsConfiguration("i18n-mage.writeRules.sortRule")) {
      const sortMode = getConfig<string>("writeRules.sortRule");
      vscode.commands.executeCommand("setContext", "allowSort", mage.langDetail.isFlat && sortMode !== "none");
    }
  });
  registerDisposable(decorator);
  registerDisposable(disposable);
}
