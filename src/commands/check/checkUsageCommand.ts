import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { throttle } from "@/utils/common";
import { t } from "@/utils/i18n";

export function registerCheckUsageCommand() {
  const mage = LangMage.getInstance();
  const throttledHandler = throttle(async () => {
    await wrapWithProgress({ title: t("command.check.progress") }, async () => {
      mage.setOptions({ task: "check", globalFlag: true, clearCache: true });
      const success = await mage.execute();
      if (success) {
        treeInstance.refresh();
      } else {
        await treeInstance.initTree();
      }
    });
  }, 3000);
  const disposable = vscode.commands.registerCommand("i18nMage.checkUsage", throttledHandler);

  registerDisposable(disposable);
}
