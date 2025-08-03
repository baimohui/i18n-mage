import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { setConfig } from "@/utils/config";

export function registerSetReferredLangCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.setReferredLang", async (lang: { key: string }) => {
    await wrapWithProgress({ title: "" }, async () => {
      mage.setOptions({ referredLang: lang.key, task: "check", globalFlag: false, clearCache: false });
      await mage.execute();
      const publicCtx = mage.getPublicContext();
      await setConfig("translationServices.referenceLanguage", publicCtx.referredLang);
      treeInstance.refresh();
    });
  });

  registerDisposable(disposable);
}
