import * as vscode from "vscode";
import { PluginConfiguration } from "@/types";
import { registerDisposable } from "@/utils/dispose";
import LangMage from "@/core/LangMage";

export function registerOnConfigChange() {
  const disposable = vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration("i18n-mage")) return;
    const mage = LangMage.getInstance();
    const config = vscode.workspace.getConfiguration("i18n-mage") as PluginConfiguration;
    if (event.affectsConfiguration("i18n-mage.syncBasedOnReferredEntries")) {
      const publicCtx = mage.getPublicContext();
      mage.setOptions({ syncBasedOnReferredEntries: config.syncBasedOnReferredEntries });
      vscode.commands.executeCommand("i18nMage.setReferredLang", publicCtx.referredLang);
    }
  });
  registerDisposable(disposable);
}
