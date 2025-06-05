import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";

export function registerSetReferredLangCommand() {
  const mage = LangMage.getInstance();
  const globalConfig = vscode.workspace.getConfiguration();
  const disposable = vscode.commands.registerCommand("i18nMage.setReferredLang", (lang: { key: string }) => {
    wrapWithProgress({
      title: "",
      callback: async () => {
        mage.setOptions({ referredLang: lang.key, task: "check", globalFlag: false, clearCache: false });
        await mage.execute();
        const publicCtx = mage.getPublicContext();
        await globalConfig.update("i18n-mage.referenceLanguage", publicCtx.referredLang, vscode.ConfigurationTarget.Workspace);
        treeInstance.refresh();
        const decorator = DecoratorController.getInstance();
        decorator.update(vscode.window.activeTextEditor);
      }
    });
  });

  registerDisposable(disposable);
}
