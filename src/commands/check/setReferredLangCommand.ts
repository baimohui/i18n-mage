import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { wrapWithProgress } from "@/utils/wrapWithProgress";

export function registerSetReferredLangCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const globalConfig = vscode.workspace.getConfiguration();
  const disposable = vscode.commands.registerCommand("i18nMage.setReferredLang", () => (lang: { key: string }) => {
    wrapWithProgress({
      title: "",
      callback: async () => {
        await globalConfig.update("i18n-mage.referenceLanguage", lang.key, vscode.ConfigurationTarget.Workspace);
        mage.setOptions({ referredLang: lang.key, task: "check", globalFlag: false, clearCache: false });
        await mage.execute();
      }
    });
  });

  context.subscriptions.push(disposable);
}
