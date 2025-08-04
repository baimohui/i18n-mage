import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { getConfig, setConfig } from "@/utils/config";

export function registerIgnoreLangCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.ignoreLang", async ({ key }: { key: string }) => {
    const ignoredLangs = getConfig<string[]>("workspace.ignoredLanguages", []);
    ignoredLangs.push(key);
    await setConfig("workspace.ignoredLanguages", [...new Set(ignoredLangs)]);
    mage.setOptions({ task: "check" });
    await mage.execute();
    treeInstance.refresh();
  });

  registerDisposable(disposable);
}
