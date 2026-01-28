import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";

export function registerToggleCaseSensitiveCommand() {
  const toggleCaseSensitive = () => {
    treeInstance.toggleCaseSensitive();
  };

  const disposable1 = vscode.commands.registerCommand("i18nMage.toggleCaseSensitive", toggleCaseSensitive);
  const disposable2 = vscode.commands.registerCommand("i18nMage.toggleCaseSensitive.active", toggleCaseSensitive);

  registerDisposable(disposable1);
  registerDisposable(disposable2);
}
