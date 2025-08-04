import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { registerDisposable } from "@/utils/dispose";
import { treeInstance } from "@/views/tree";
import { getConfig, setConfig } from "@/utils/config";

export function registerUnmarkAsUsedCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.unmarkAsUsed", async (e: vscode.TreeItem & { name: string }) => {
    const manuallyMarkedUsedEntries = getConfig<string[]>("workspace.manuallyMarkedUsedEntries", []).filter(
      entryName => entryName !== e.name
    );
    await setConfig("workspace.manuallyMarkedUsedEntries", manuallyMarkedUsedEntries);
    mage.setOptions({ task: "check" });
    await mage.execute();
    treeInstance.refresh();
  });

  registerDisposable(disposable);
}
