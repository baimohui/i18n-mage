import LangMage from "@/core/LangMage";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { unescapeString } from "@/utils/regex";
import { stripQuotesFromRange } from "@/utils/range";
import * as vscode from "vscode";

export class KeyReferenceProvider implements vscode.ReferenceProvider {
  public static keyOverride: string | null = null;

  async provideReferences(): Promise<vscode.Location[]> {
    const keyAtCursor = KeyReferenceProvider.keyOverride ?? ActiveEditorState.keyAtCursor;
    KeyReferenceProvider.keyOverride = null;
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
        const text = doc.getText();
        const [startOffset, endOffset] = stripQuotesFromRange(text, startPos, endPos);
        const rangeStart = doc.positionAt(startOffset);
        const rangeEnd = rangeStart.translate(0, endOffset - startOffset);
        const range = new vscode.Range(rangeStart, rangeEnd);
        locations.push(new vscode.Location(doc.uri, range));
      });
    }
    return locations;
  }
}
