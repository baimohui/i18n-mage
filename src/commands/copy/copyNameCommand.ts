import * as vscode from "vscode";

export function registerCopyNameCommand(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand("i18nMage.copyName", async (e: vscode.TreeItem) => {
    if (typeof e.label !== "string" || e.label.trim() === "") return;
    await vscode.env.clipboard.writeText(e.label);
    vscode.window.showInformationMessage(`已复制：${e.label}`);
  });

  context.subscriptions.push(disposable);
}
