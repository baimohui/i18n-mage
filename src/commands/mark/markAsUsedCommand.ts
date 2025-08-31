import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { registerDisposable } from "@/utils/dispose";
import { treeInstance } from "@/views/tree";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig, setConfig } from "@/utils/config";
import { unescapeString } from "@/utils/regex";

export function registerMarkAsUsedCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.markAsUsed",
    async (e: (vscode.TreeItem & { data: string[] }) | undefined) => {
      let targets: string[] = [];
      if (e === undefined || typeof e.label !== "string" || e.label.trim() === "" || !Array.isArray(e.data) || e.data.length === 0) {
        const unusedKeys = Array.from(mage.langDetail.unusedKeySet);
        if (unusedKeys.length === 0) {
          NotificationManager.showWarning(t("command.markAsUsed.noUnusedKey"));
        } else {
          targets =
            (await vscode.window.showQuickPick(unusedKeys, {
              canPickMany: true,
              placeHolder: t("command.pick.selectKey")
            })) || [];
        }
      } else {
        targets = e.data;
      }
      if (targets.length === 0) return;
      const manuallyMarkedUsedEntries = getConfig<string[]>("workspace.manuallyMarkedUsedEntries", []);
      const usedNameList = targets.map(key => unescapeString(key));
      manuallyMarkedUsedEntries.push(...usedNameList);
      await setConfig("workspace.manuallyMarkedUsedEntries", manuallyMarkedUsedEntries);
      mage.setOptions({ task: "check" });
      const res = await mage.execute();
      treeInstance.refresh();
      res.defaultSuccessMessage = t("command.markAsUsed.success", usedNameList.join(", "));
      NotificationManager.showResult(res);
    }
  );

  registerDisposable(disposable);
}
