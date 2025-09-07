import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";

export function registerOpenSettingsCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.openSettings", () => {
    vscode.commands.executeCommand("workbench.action.openSettings", "@ext:jensen-wen.i18n-mage");
  });

  registerDisposable(disposable);
}
