import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
export function registerSearchInFilesCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.searchInFiles", () => {
    const keyword = treeInstance.globalFilter.text;
    vscode.commands.executeCommand("workbench.action.findInFiles", {
      query: keyword,
      isCaseSensitive: treeInstance.isCaseSensitive,
      matchWholeWord: treeInstance.isWholeWordMatch
    });
  });
  registerDisposable(disposable);
}
