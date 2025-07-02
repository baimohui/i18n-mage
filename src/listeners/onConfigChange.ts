import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import LangMage from "@/core/LangMage";
import { getConfig } from "@/utils/config";

export function registerOnConfigChange() {
  const mage = LangMage.getInstance();
  const decorator = DecoratorController.getInstance();
  const disposable = vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration("i18n-mage")) return;
    if (event.affectsConfiguration("i18n-mage.syncBasedOnReferredEntries")) {
      const publicCtx = mage.getPublicContext();
      mage.setOptions({ syncBasedOnReferredEntries: getConfig<boolean>("syncBasedOnReferredEntries", false) });
      vscode.commands.executeCommand("i18nMage.setReferredLang", publicCtx.referredLang);
    } else if (
      event.affectsConfiguration("i18n-mage.translationHints.light") ||
      event.affectsConfiguration("i18n-mage.translationHints.dark") ||
      event.affectsConfiguration("i18n-mage.translationHints.maxLength") ||
      event.affectsConfiguration("i18n-mage.translationHints.enableLooseKeyMatch")
    ) {
      decorator.updateTranslationDecoration();
    }
  });
  registerDisposable(decorator);
  registerDisposable(disposable);
}
