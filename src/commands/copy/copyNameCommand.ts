import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";

export function registerCopyNameCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.copyName", async (e: vscode.TreeItem) => {
    if (typeof e.label !== "string" || e.label.trim() === "") return;
    await vscode.env.clipboard.writeText(e.label);
    vscode.window.showInformationMessage(t("command.copy.success", e.label));
  });

  registerDisposable(disposable);
}
