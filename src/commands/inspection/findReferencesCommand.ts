import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";
import { unescapeString } from "@/utils/regex";

export function registerFindReferencesCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.findReferences", async (e: { key: string } | undefined) => {
    if (e === undefined || e.key === undefined || e.key === "") {
      NotificationManager.showError(t("common.noKeyProvided"));
      return;
    }

    const locations: vscode.Location[] = [];
    const mage = LangMage.getInstance();
    const { used: usedEntryMap } = mage.langDetail;
    const name = unescapeString(e.key);
    const usedInfo = usedEntryMap[name] ?? {};

    if (Object.keys(usedInfo).length === 0) {
      NotificationManager.showWarning(t("command.findReferences.noReferences", e.key));
      return;
    }

    for (const [file, posSet] of Object.entries(usedInfo)) {
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const posList = Array.from(posSet);
        posList.forEach(pos => {
          const [startPos, endPos] = pos.split(",").map(Number);
          const rangeStart = doc.positionAt(startPos);
          const rangeEnd = rangeStart.translate(0, endPos - startPos);
          const range = new vscode.Range(rangeStart, rangeEnd);
          locations.push(new vscode.Location(doc.uri, range));
        });
      } catch (error) {
        console.error(`Error opening document ${file}:`, error);
      }
    }

    if (locations.length > 0) {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        await vscode.commands.executeCommand(
          "editor.action.showReferences",
          activeEditor.document.uri,
          activeEditor.selection.active,
          locations
        );
      } else {
        // 如果没有活动编辑器，使用第一个引用位置作为上下文
        if (locations.length > 0) {
          const firstLocation = locations[0];
          await vscode.commands.executeCommand("editor.action.showReferences", firstLocation.uri, firstLocation.range.start, locations);
        }
      }
    } else {
      NotificationManager.showWarning(t("command.findReferences.noReferences", e.key));
    }
  });

  registerDisposable(disposable);
}
