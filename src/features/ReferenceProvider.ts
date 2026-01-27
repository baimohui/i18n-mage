import LangMage from "@/core/LangMage";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { unescapeString } from "@/utils/regex";
import * as vscode from "vscode";

export class KeyReferenceProvider implements vscode.ReferenceProvider {
  async provideReferences(): Promise<vscode.Location[]> {
    const keyAtCursor = ActiveEditorState.keyAtCursor;
    if (!keyAtCursor) return [];
    const locations: vscode.Location[] = [];
    const mage = LangMage.getInstance();
    const { used: usedEntryMap } = mage.langDetail;
    const name = unescapeString(keyAtCursor);
    const usedInfo = usedEntryMap[name] ?? [];
    for (const [file, posSet] of Object.entries(usedInfo)) {
      const doc = await vscode.workspace.openTextDocument(file);
      const posList = Array.from(posSet);
      posList.forEach(pos => {
        const [startPos, endPos] = pos.split(",").map(Number);
        const rangeStart = doc.positionAt(startPos);
        const rangeEnd = rangeStart.translate(0, endPos - startPos);
        const range = new vscode.Range(rangeStart, rangeEnd);
        locations.push(new vscode.Location(doc.uri, range));
      });
    }
    return locations;
  }
}
