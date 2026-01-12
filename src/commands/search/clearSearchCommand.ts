import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";

/**
 * 注册清除搜索命令
 * @param context 插件上下文
 */
export function registerClearSearchCommand(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("i18nMage.clearSearch", () => {
      treeInstance.clearSearch();
    })
  );
}
