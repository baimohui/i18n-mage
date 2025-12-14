import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig, setConfig } from "@/utils/config";

export function registerIgnoreUndefinedCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.ignoreUndefined",
    async (e: (vscode.TreeItem & { data: string[] }) | undefined) => {
      const ignoredUndefinedEntries = getConfig<string[]>("workspace.ignoredUndefinedEntries", []);
      let targets: string[] = [];
      if (e === undefined || !Array.isArray(e.data) || e.data.length === 0) {
        const undefinedEntries = Object.keys(mage.langDetail.undefined);
        if (undefinedEntries.length === 0) {
          NotificationManager.showWarning(t("commands.ignoreUndefined.noUndefinedEntry"));
        } else {
          targets =
            (await vscode.window.showQuickPick(undefinedEntries, {
              canPickMany: true,
              placeHolder: t("commands.ignoreUndefined.placeholder")
            })) || [];
        }
      } else {
        targets = e.data;
      }
      if (targets.length === 0) return;
      ignoredUndefinedEntries.push(...targets);
      await setConfig("workspace.ignoredUndefinedEntries", ignoredUndefinedEntries);
      NotificationManager.showSuccess(t("command.delete.success", targets.join(", ")));
    }
  );

  registerDisposable(disposable);
}
