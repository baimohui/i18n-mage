import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { wrapWithProgress } from "@/utils/wrapWithProgress";

export function registerSortCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.sort", () => {
    wrapWithProgress({
      title: "排序中...",
      callback: async () => {
        mage.setOptions({ task: "sort", globalFlag: true, rewriteFlag: true });
        const success = await mage.execute();
        if (success) {
          vscode.window.showInformationMessage("Sort success");
        }
      }
    });
  });

  context.subscriptions.push(disposable);
}
