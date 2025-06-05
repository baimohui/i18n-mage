import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { throttle } from "@/utils/common";
import { t } from "@/utils/i18n";

export function registerCheckUsageCommand() {
  const mage = LangMage.getInstance();
  const throttledHandler = throttle(() => {
    wrapWithProgress({
      title: t("command.check.progress"),
      callback: async () => {
        const config = vscode.workspace.getConfiguration("i18n-mage");
        const ignoredFileList = config.ignoredFileList as string[]; // Ensure proper typing
        mage.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList });
        const res = await mage.execute();
        if (!res) {
          await treeInstance.initTree();
        }
      }
    });
  }, 3000);
  const disposable = vscode.commands.registerCommand("i18nMage.checkUsage", throttledHandler);

  registerDisposable(disposable);
}
