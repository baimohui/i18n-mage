import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";

/**
 * 注册清除搜索命令
 * @param context 插件上下文
 */
export function registerCancelSearchCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.cancelSearch", () => {
    treeInstance.cancelSearch();
  });
  registerDisposable(disposable);
}
