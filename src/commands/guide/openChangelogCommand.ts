import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { showUpdateSummaryManually } from "@/utils/updateSummary";

export function registerOpenChangelogCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("i18nMage.openChangelog", () => {
    void showUpdateSummaryManually(context);
  });

  registerDisposable(disposable);
}
