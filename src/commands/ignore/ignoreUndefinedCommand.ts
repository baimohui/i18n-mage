import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { registerDisposable } from "@/utils/dispose";
import { treeInstance } from "@/views/tree";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig, setConfig } from "@/utils/config";

export function registerIgnoreUndefinedCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.ignoreUndefined", async (e: vscode.TreeItem & { data: string[] }) => {
    if (typeof e.label !== "string" || e.label.trim() === "" || !Array.isArray(e.data) || e.data.length === 0) return;
    const ignoredUndefinedEntries = getConfig<string[]>("workspace.ignoredUndefinedEntries", []);
    ignoredUndefinedEntries.push(...e.data);
    await setConfig("workspace.ignoredUndefinedEntries", ignoredUndefinedEntries);
    mage.setOptions({ task: "check" });
    const res = await mage.execute();
    treeInstance.refresh();
    res.defaultSuccessMessage = t("command.delete.success", e.data.join(", "));
    NotificationManager.showResult(res);
  });

  registerDisposable(disposable);
}
