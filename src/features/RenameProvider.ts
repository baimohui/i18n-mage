import * as vscode from "vscode";
import { ActiveEditorState } from "@/utils/activeEditorState";
import LangMage from "@/core/LangMage";
import { getFileLocationFromId, getValueByAmbiguousEntryName } from "@/utils/regex";
import { NotificationManager } from "@/utils/notification";
import { t } from "@/utils/i18n";
import { treeInstance } from "@/views/tree";

export class RenameKeyProvider implements vscode.RenameProvider {
  async provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newKey: string): Promise<vscode.WorkspaceEdit | null> {
    const prepareResult = this.prepareRename(document, position);
    if (!prepareResult) return null;
    const mage = LangMage.getInstance();
    const { dictionary, usedLiteralKeySet } = mage.langDetail;
    const publicCtx = mage.getPublicContext();
    const entryKey = prepareResult.placeholder;
    if (usedLiteralKeySet.has(entryKey)) {
      NotificationManager.setStatusBarMessage(t(`command.rename.suspectedNonFunctionImport`, entryKey));
      return null;
    }
    if (Object.hasOwn(dictionary, newKey)) {
      NotificationManager.setStatusBarMessage(t(`command.rename.key0AlreadyExists`, newKey));
      return null;
    }
    const keyChange = {
      key: { before: entryKey, after: newKey },
      filePos: { before: "", after: "" },
      fullPath: { before: entryKey, after: newKey }
    };
    if (publicCtx.fileStructure) {
      const fullPath = dictionary[entryKey].fullPath.replace(entryKey, newKey);
      const filePos = getFileLocationFromId(fullPath, publicCtx.fileStructure);
      if (filePos === null) {
        NotificationManager.setStatusBarMessage(t("command.rename.key0PointsToANonExistentFilePath", newKey));
        return null;
      }
      keyChange.filePos = { before: dictionary[entryKey].fileScope, after: filePos.join(".") };
      keyChange.fullPath = { before: dictionary[entryKey].fullPath, after: fullPath };
    }
    await mage.execute({ task: "modify", modifyQuery: { type: "renameKey", key: entryKey, keyChange } });
    await mage.execute({ task: "check" });
    treeInstance.refresh();
    if (publicCtx.sortAfterFix) {
      await mage.execute({ task: "sort" });
    }
    const workspaceEdit = new vscode.WorkspaceEdit();
    // Example logic: Add edits to the workspaceEdit object
    // workspaceEdit.replace(document.uri, new vscode.Range(position, position), newName);
    return workspaceEdit;
  }
  prepareRename(document: vscode.TextDocument, position: vscode.Position) {
    const mage = LangMage.getInstance();
    const definedEntries = Array.from(ActiveEditorState.definedEntries.values()).flat();
    for (const entry of definedEntries) {
      if (entry.dynamic || !entry.visible || !entry.funcCall) continue;
      const [startPos, endPos] = entry.pos.split(",").map(pos => document.positionAt(+pos));
      const range = new vscode.Range(startPos, endPos);
      if (range.contains(position)) {
        const entryKey = getValueByAmbiguousEntryName(mage.langDetail.tree, entry.nameInfo.name);
        if (entryKey === undefined) return null;
        return { range, placeholder: entryKey };
      }
    }
  }
}
