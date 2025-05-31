import * as vscode from "vscode";

export function registerCopyValueCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("i18nMage.copyValue", async (e: vscode.TreeItem) => {
    if (typeof e.description !== "string" || e.description.trim() === "") return;
    await vscode.env.clipboard.writeText(String(e.description));
    vscode.window.showInformationMessage(`已复制：${e.description}`);
  });

  context.subscriptions.push(disposable);
}
