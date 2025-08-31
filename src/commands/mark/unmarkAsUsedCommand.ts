import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { registerDisposable } from "@/utils/dispose";
import { treeInstance } from "@/views/tree";
import { getConfig, setConfig } from "@/utils/config";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerUnmarkAsUsedCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.unmarkAsUsed",
    async (e: (vscode.TreeItem & { name: string }) | undefined) => {
      let targets: string[] = [];
      const manuallyMarkedUsedEntries = getConfig<string[]>("workspace.manuallyMarkedUsedEntries", []);
      if (e === undefined) {
        if (manuallyMarkedUsedEntries.length === 0) {
          NotificationManager.showWarning(t("commands.unmarkAsUsed.noManuallyMarked"));
        } else {
          targets =
            (await vscode.window.showQuickPick(manuallyMarkedUsedEntries, {
              canPickMany: true,
              placeHolder: t("commands.unmarkAsUsed.placeholder")
            })) || [];
        }
      } else {
        targets.push(e.name);
      }
      if (targets.length > 0) {
        await setConfig(
          "workspace.manuallyMarkedUsedEntries",
          manuallyMarkedUsedEntries.filter(entry => !targets.includes(entry))
        );
        mage.setOptions({ task: "check" });
        await mage.execute();
        treeInstance.refresh();
      }
    }
  );

  registerDisposable(disposable);
}
