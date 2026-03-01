import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";
import { unescapeString } from "@/utils/regex";
import { KeyReferenceProvider } from "@/features/ReferenceProvider";

export function registerFindReferencesCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.findReferences", async (e: { key: string } | undefined) => {
    if (e === undefined || e.key === undefined || e.key === "") {
      NotificationManager.showError(t("common.noKeyProvided"));
      return;
    }

    const mage = LangMage.getInstance();
    const { used: usedEntryMap } = mage.langDetail;
    const name = unescapeString(e.key);
    const usedInfo = usedEntryMap[name] ?? {};

    if (Object.keys(usedInfo).length === 0) {
      NotificationManager.showWarning(t("command.findReferences.noReferences", e.key));
      return;
    }

    let activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      const firstEntry = Object.entries(usedInfo)[0];
      const firstFile = firstEntry?.[0];
      const firstPosSet = firstEntry?.[1];
      const firstPos = firstPosSet !== undefined ? Array.from(firstPosSet)[0] : undefined;

      if (typeof firstFile === "string" && firstFile !== "" && typeof firstPos === "string" && firstPos !== "") {
        const doc = await vscode.workspace.openTextDocument(firstFile);
        activeEditor = await vscode.window.showTextDocument(doc);
        const [startPos] = firstPos.split(",").map(Number);
        const anchorPos = doc.positionAt(startPos);
        activeEditor.selection = new vscode.Selection(anchorPos, anchorPos);
        activeEditor.revealRange(new vscode.Range(anchorPos, anchorPos));
      }
    }

    if (!activeEditor) {
      NotificationManager.showWarning(t("command.findReferences.noReferences", e.key));
      return;
    }

    KeyReferenceProvider.keyOverride = e.key;
    await vscode.commands.executeCommand("references-view.findReferences");
  });

  registerDisposable(disposable);
}
