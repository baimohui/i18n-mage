import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import LangMage from "@/core/LangMage";
import { getConfig } from "@/utils/config";

export function registerOnConfigChange() {
  const disposable = vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration("i18n-mage")) return;
    const mage = LangMage.getInstance();
    if (event.affectsConfiguration("i18n-mage.syncBasedOnReferredEntries")) {
      const publicCtx = mage.getPublicContext();
      mage.setOptions({ syncBasedOnReferredEntries: getConfig<boolean>("syncBasedOnReferredEntries", false) });
      vscode.commands.executeCommand("i18nMage.setReferredLang", publicCtx.referredLang);
    }
  });
  registerDisposable(disposable);
}
