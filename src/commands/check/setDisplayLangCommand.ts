import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { setConfig } from "@/utils/config";

export function registerSetDisplayLangCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.setDisplayLang", async (lang: { key: string }) => {
    await wrapWithProgress({ title: "" }, async () => {
      mage.setOptions({ displayLang: lang.key, task: "check", globalFlag: false, clearCache: false });
      await mage.execute();
      const publicCtx = mage.getPublicContext();
      await setConfig("general.displayLanguage", publicCtx.displayLang);
      treeInstance.refresh();
      const decorator = DecoratorController.getInstance();
      decorator.update(vscode.window.activeTextEditor);
    });
  });

  registerDisposable(disposable);
}
