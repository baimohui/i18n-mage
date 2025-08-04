import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { setConfig } from "@/utils/config";

export function registerSetDisplayLangCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.setDisplayLang", async (lang: { key: string }) => {
    await wrapWithProgress({ title: "" }, async () => {
      await setConfig("general.displayLanguage", lang.key);
      treeInstance.refresh();
    });
  });

  registerDisposable(disposable);
}
