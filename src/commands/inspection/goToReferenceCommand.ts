import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";

export function registerGoToReferenceCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.goToReference",
    async (e: { usedInfo: Record<string, Set<string>> } | undefined) => {
      let resourceUri: vscode.Uri | undefined = undefined;
      let usedInfo: Record<string, Set<string>> | undefined = undefined;
      if (e === undefined) {
        const usedEntryMap = mage.langDetail.used;
        const name = await vscode.window.showQuickPick(Object.keys(usedEntryMap), {
          canPickMany: false,
          placeHolder: t("command.goToReference.selectEntry")
        });
        if (name === undefined) return;
        const filePath = await vscode.window.showQuickPick(Object.keys(usedEntryMap[name]), {
          canPickMany: false,
          placeHolder: t("command.goToReference.selectFile")
        });
        if (filePath === undefined) return;
        resourceUri = vscode.Uri.file(filePath);
        usedInfo = { [filePath]: usedEntryMap[name][filePath] };
        // const document = await vscode.workspace.openTextDocument(resourceUri);
      } else {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          NotificationManager.showError(t("common.noActiveEditorWarn"));
          return;
        }
        resourceUri = editor.document.uri;
        usedInfo = e.usedInfo;
      }
      if (typeof usedInfo === "object" && Object.keys(usedInfo).length > 0) {
        const matchedPath = Object.keys(usedInfo).find(filePath => vscode.Uri.file(filePath).fsPath === resourceUri.fsPath);
        const document = await vscode.workspace.openTextDocument(resourceUri);
        const set = usedInfo[matchedPath!];
        const pos = set.size > 0 ? set.values().next().value : undefined;
        if (pos !== undefined) {
          const [startPos, endPos] = pos.split(",").map(pos => document.positionAt(+pos));
          const selection = new vscode.Range(startPos, endPos);
          vscode.window.showTextDocument(resourceUri, { selection });
        }
      }
    }
  );

  registerDisposable(disposable);
}
