import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { getConfig, setConfig } from "@/utils/config";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerUnignoreLangCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.unignoreLang", async (lang: { key: string } | undefined) => {
    const ignoredLangs = getConfig<string[]>("workspace.ignoredLanguages", []);
    let target: string | undefined = undefined;
    if (lang) {
      target = lang.key;
    } else if (ignoredLangs.length > 0) {
      target = await vscode.window.showQuickPick(ignoredLangs, { placeHolder: t("command.pick.selectLang") });
    } else {
      NotificationManager.showWarning(t("command.unignoreLang.noIgnoredLang"));
    }
    if (target !== undefined) {
      await setConfig(
        "workspace.ignoredLanguages",
        ignoredLangs.filter(i => i !== target)
      );
      mage.setOptions({ task: "check" });
      await mage.execute();
      treeInstance.refresh();
    }
  });

  registerDisposable(disposable);
}
