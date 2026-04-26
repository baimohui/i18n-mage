import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { getSearchQuickPick } from "@/features/SearchQuickPick";

export function registerSearchCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.search", () => {
    getSearchQuickPick().focus();
  });
  registerDisposable(disposable);
}
