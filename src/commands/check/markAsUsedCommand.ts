import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { registerDisposable } from "@/utils/dispose";
import { treeInstance } from "@/views/tree";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig, setConfig } from "@/utils/config";

export function registerMarkAsUsedCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.markAsUsed",
    async (e: vscode.TreeItem & { data: { name: string; key: string }[] }) => {
      if (typeof e.label !== "string" || e.label.trim() === "" || !Array.isArray(e.data) || e.data.length === 0) return;
      const manuallyMarkedUsedEntries = getConfig<string[]>("manuallyMarkedUsedEntries", []);
      const usedNameList = e.data.map(item => item.name);
      manuallyMarkedUsedEntries.push(...usedNameList);
      await setConfig("manuallyMarkedUsedEntries", manuallyMarkedUsedEntries);
      mage.setOptions({ task: "check", globalFlag: true, clearCache: true });
      const res = await mage.execute();
      treeInstance.refresh();
      NotificationManager.showResult(res, t("command.markAsUsed.success", usedNameList.join(", ")));
    }
  );

  registerDisposable(disposable);
}
