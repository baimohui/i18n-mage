import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";

export function registerCopyValueCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.copyValue", async (e: vscode.TreeItem) => {
    if (typeof e.description !== "string" || e.description.trim() === "") return;
    await vscode.env.clipboard.writeText(String(e.description));
    vscode.window.showInformationMessage(t("command.copy.success", e.description));
  });

  registerDisposable(disposable);
}
