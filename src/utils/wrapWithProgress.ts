import * as vscode from "vscode";
let isProcessing = false;

export function wrapWithProgress({ title, callback }: { title: string; callback: () => Promise<void> }): void {
  if (isProcessing) {
    vscode.window.showWarningMessage("Already processing. Please wait.");
    return;
  }

  vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, async () => {
    isProcessing = true;
    try {
      await callback();
    } finally {
      isProcessing = false;
    }
  });
}
