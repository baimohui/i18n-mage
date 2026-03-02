import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";
import { unescapeString } from "@/utils/regex";
import { KeyReferenceProvider } from "@/features/ReferenceProvider";

type FindReferencesArgs = {
  key: string;
  anchorUri?: string;
  anchorPosition?: {
    line: number;
    character: number;
  };
};

export function registerFindReferencesCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.findReferences", async (e: FindReferencesArgs | undefined) => {
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
    const hasHoverAnchor =
      typeof e.anchorUri === "string" &&
      e.anchorUri !== "" &&
      typeof e.anchorPosition?.line === "number" &&
      typeof e.anchorPosition?.character === "number";

    if (hasHoverAnchor) {
      const anchorUri = e.anchorUri as string;
      const anchorLine = e.anchorPosition?.line as number;
      const anchorCharacter = e.anchorPosition?.character as number;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(anchorUri));
      activeEditor = await vscode.window.showTextDocument(doc);
      const anchorPos = new vscode.Position(anchorLine, anchorCharacter);
      activeEditor.selection = new vscode.Selection(anchorPos, anchorPos);
      activeEditor.revealRange(new vscode.Range(anchorPos, anchorPos));
    } else {
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
