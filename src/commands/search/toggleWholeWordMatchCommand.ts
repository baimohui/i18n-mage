import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
// import { t } from "@/utils/i18n";

/**
 * 注册切换全词匹配命令
 */
export function registerToggleWholeWordMatchCommand() {
  const toggleWholeWordMatch = () => {
    treeInstance.toggleWholeWordMatch();
    // vscode.window.showInformationMessage(t("command.toggleWholeWordMatch." + (treeInstance.isWholeWordMatch ? "enabled" : "disabled")));
  };

  const disposable1 = vscode.commands.registerCommand("i18nMage.toggleWholeWordMatch", toggleWholeWordMatch);
  const disposable2 = vscode.commands.registerCommand("i18nMage.toggleWholeWordMatch.active", toggleWholeWordMatch);

  registerDisposable(disposable1);
  registerDisposable(disposable2);
}
