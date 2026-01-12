import * as vscode from "vscode";
import { SearchProvider } from "@/views/search";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";

export function registerFocusSearchCommand(context: vscode.ExtensionContext) {
  const searchProvider = new SearchProvider(context.extensionUri, filter => treeInstance.setFilter(filter));
  const disposable = vscode.commands.registerCommand("i18nMage.focusSearch", () => {
    searchProvider.focus();
  });
  registerDisposable(vscode.window.registerWebviewViewProvider(SearchProvider.viewType, searchProvider));
  registerDisposable(disposable);
}
