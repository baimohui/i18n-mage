import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { Diagnostics } from "@/features/Diagnostics";

export function registerOnDocumentClose() {
  const diagnostics = Diagnostics.getInstance();
  const disposable = vscode.workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
    diagnostics.clear(doc);
  });
  registerDisposable(diagnostics);
  registerDisposable(disposable);
}
