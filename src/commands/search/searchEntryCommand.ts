import * as vscode from "vscode";
import { t } from "@/utils/i18n";
import { treeInstance } from "@/views/tree";

/**
 * 注册搜索词条命令
 * @param context 插件上下文
 */
export function registerSearchEntryCommand(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("i18nMage.searchEntry", async () => {
      const keyword = await vscode.window.showInputBox({
        placeHolder: t("command.searchEntry.placeHolder"),
        prompt: t("command.searchEntry.prompt"),
        value: treeInstance.globalFilter.text
      });
      if (keyword !== undefined && keyword.trim() !== "") {
        treeInstance.setSearch(keyword.trim());
        vscode.commands.executeCommand("workbench.view.extension.i18nMage");
      }
    })
  );
}
