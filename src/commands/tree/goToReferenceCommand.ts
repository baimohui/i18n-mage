import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";

export function registerGoToReferenceCommand() {
  const disposable = vscode.commands.registerCommand(
    "i18nMage.goToReference",
    async (e: { usedInfo: Record<string, number[]>; label: string }) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage(t("common.noActiveEditorWarn"));
        return;
      }
      const resourceUri = editor.document.uri;
      if (typeof e.usedInfo === "object" && Object.keys(e.usedInfo).length > 0) {
        const matchedPath = Object.keys(e.usedInfo).find(filePath => vscode.Uri.file(filePath).fsPath === resourceUri.fsPath);
        const document = await vscode.workspace.openTextDocument(resourceUri);
        const pos = document.positionAt(e.usedInfo[matchedPath!][0]);
        const selection = new vscode.Range(pos, pos.translate(0, e.label.length));
        vscode.window.showTextDocument(resourceUri, { selection });
      }
    }
  );

  registerDisposable(disposable);
}
