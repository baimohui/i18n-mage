import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { treeInstance } from "@/views/tree";

export function registerSearchNavigationCommand() {
  const commandMap = [
    { id: "i18nMage.searchPreviousInFileEntry", direction: "previousInFileEntry" },
    { id: "i18nMage.searchNextInFileEntry", direction: "nextInFileEntry" },
    { id: "i18nMage.searchPreviousGlobalEntry", direction: "previousGlobalEntry" },
    { id: "i18nMage.searchNextGlobalEntry", direction: "nextGlobalEntry" },
    { id: "i18nMage.searchPreviousFile", direction: "previousFile" },
    { id: "i18nMage.searchNextFile", direction: "nextFile" }
  ] as const;

  commandMap.forEach(item => {
    const disposable = vscode.commands.registerCommand(item.id, () => {
      treeInstance.navigateSearchResult(item.direction);
    });
    registerDisposable(disposable);
  });
}
