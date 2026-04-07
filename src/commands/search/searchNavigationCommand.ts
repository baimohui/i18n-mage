import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { treeInstance } from "@/views/tree";

export function registerSearchNavigationCommand() {
  const commandMap = [
    { id: "i18nMage.searchPreviousFile", direction: "previousFile" },
    { id: "i18nMage.searchPreviousEntry", direction: "previousEntry" },
    { id: "i18nMage.searchNextEntry", direction: "nextEntry" },
    { id: "i18nMage.searchNextFile", direction: "nextFile" }
  ] as const;

  commandMap.forEach(item => {
    const disposable = vscode.commands.registerCommand(item.id, () => {
      treeInstance.navigateSearchResult(item.direction);
    });
    registerDisposable(disposable);
  });
}
