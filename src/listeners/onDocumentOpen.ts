import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { Diagnostics } from "@/features/Diagnostics";

export function registerOnDocumentOpen() {
  const diagnostics = Diagnostics.getInstance();
  const disposable = vscode.workspace.onDidOpenTextDocument((doc: vscode.TextDocument) => {
    diagnostics.update(doc);
  });
  registerDisposable(diagnostics);
  registerDisposable(disposable);
}
