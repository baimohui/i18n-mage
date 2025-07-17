import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerGoToReferenceCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.goToReference", async (e: { usedInfo: Record<string, Set<string>> }) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      NotificationManager.showError(t("common.noActiveEditorWarn"));
      return;
    }
    const resourceUri = editor.document.uri;
    if (typeof e.usedInfo === "object" && Object.keys(e.usedInfo).length > 0) {
      const matchedPath = Object.keys(e.usedInfo).find(filePath => vscode.Uri.file(filePath).fsPath === resourceUri.fsPath);
      const document = await vscode.workspace.openTextDocument(resourceUri);
      const set = e.usedInfo[matchedPath!];
      const pos = set.size > 0 ? set.values().next().value : undefined;
      if (pos !== undefined) {
        const [startPos, endPos] = pos.split(",").map(pos => document.positionAt(+pos));
        const selection = new vscode.Range(startPos, endPos);
        vscode.window.showTextDocument(resourceUri, { selection });
      }
    }
  });

  registerDisposable(disposable);
}
