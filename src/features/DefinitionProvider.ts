import * as vscode from "vscode";
import { ActiveEditorState } from "@/utils/activeEditorState";
import LangMage from "@/core/LangMage";
import { getFileLocationFromId, getPropertyRange } from "@/utils/regex";
import path from "path";

export class KeyDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition() {
    const keyAtCursor = ActiveEditorState.keyAtCursor;
    if (!keyAtCursor) return null;
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    const referredLang = publicCtx.referredLang;
    const dictionary = mage.langDetail.dictionary;
    const entry = dictionary[keyAtCursor];
    if (entry === undefined) return null;
    let filePathSegs: string[] = [];
    const fullKey = entry.fullPath;
    if (publicCtx.fileStructure !== null) {
      filePathSegs = getFileLocationFromId(fullKey, publicCtx.fileStructure) ?? [];
    }
    const realKey = filePathSegs.length > 0 ? fullKey.replace(`${filePathSegs.join(".")}.`, "") : fullKey;
    const resourceUri = vscode.Uri.file(path.join(publicCtx.langPath, referredLang, ...filePathSegs) + `.${publicCtx.langFileType}`);
    const range = await getPropertyRange(resourceUri, realKey);
    if (range !== null) {
      return new vscode.Location(resourceUri, range);
    }
    return null;
  }
}
