import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import LangMage from "@/core/LangMage";
import { clearConfigCache, getConfig } from "@/utils/config";

export function registerOnConfigChange() {
  const mage = LangMage.getInstance();
  const decorator = DecoratorController.getInstance();
  const disposable = vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration("i18n-mage")) return;
    if (event.affectsConfiguration("i18n-mage.general.syncBasedOnReferredEntries")) {
      const publicCtx = mage.getPublicContext();
      mage.setOptions({ syncBasedOnReferredEntries: getConfig<boolean>("general.syncBasedOnReferredEntries", false) });
      vscode.commands.executeCommand("i18nMage.setReferredLang", publicCtx.referredLang);
    } else if (
      event.affectsConfiguration("i18n-mage.translationHints.light") ||
      event.affectsConfiguration("i18n-mage.translationHints.dark") ||
      event.affectsConfiguration("i18n-mage.translationHints.maxLength") ||
      event.affectsConfiguration("i18n-mage.translationHints.enableLooseKeyMatch")
    ) {
      decorator.updateTranslationDecoration();
    } else if (event.affectsConfiguration("i18n-mage.writeRules.sortOnWrite")) {
      const sortMode = getConfig<string>("writeRules.sortOnWrite");
      vscode.commands.executeCommand("setContext", "allowSort", mage.langDetail.isFlat && sortMode !== "none");
    } else if (event.affectsConfiguration("i18n-mage.workspace")) {
      clearConfigCache();
    }
  });
  registerDisposable(decorator);
  registerDisposable(disposable);
}
