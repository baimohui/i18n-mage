import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";

export function registerFeedbackCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.feedback", () => {
    vscode.env.openExternal(vscode.Uri.parse("https://github.com/baimohui/i18n-mage/issues/new"));
  });

  registerDisposable(disposable);
}
