import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { getConfig, setConfig } from "@/utils/config";

export function registerUnignoreLangCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.unignoreLang", async ({ key }: { key: string }) => {
    const ignoredLangs = getConfig<string[]>("workspace.ignoredLanguages", []);
    await setConfig(
      "workspace.ignoredLanguages",
      ignoredLangs.filter(i => i !== key)
    );
    mage.setOptions({ task: "check", globalFlag: true, clearCache: true });
    await mage.execute();
    treeInstance.refresh();
  });

  registerDisposable(disposable);
}
