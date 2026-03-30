import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";

export function registerToggleSourceLangOnlyCommand() {
  const toggleSourceLangOnly = () => {
    treeInstance.toggleSourceLangOnly();
  };

  const disposable1 = vscode.commands.registerCommand("i18nMage.toggleSourceLangOnly", toggleSourceLangOnly);
  const disposable2 = vscode.commands.registerCommand("i18nMage.toggleSourceLangOnly.active", toggleSourceLangOnly);
  registerDisposable(disposable1);
  registerDisposable(disposable2);
}
