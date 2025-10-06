import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";

export function registerStarCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.star", () => {
    vscode.env.openExternal(vscode.Uri.parse("https://github.com/baimohui/i18n-mage"));
  });

  registerDisposable(disposable);
}
