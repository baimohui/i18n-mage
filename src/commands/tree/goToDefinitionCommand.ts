import path from "path";
import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { getFileLocationFromId, selectProperty } from "@/utils/regex";
import { registerDisposable } from "@/utils/dispose";

export function registerGoToDefinitionCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.goToDefinition", async (e: { data: { key: string; lang: string } }) => {
    const mage = LangMage.getInstance();
    const { key, lang } = e.data;
    const publicCtx = mage.getPublicContext();
    let filePathSegs: string[] = [];
    if (publicCtx.fileStructure?.children) {
      filePathSegs = getFileLocationFromId(key, publicCtx.fileStructure.children[lang]) ?? [];
    }
    const realKey = filePathSegs.length > 0 ? key.replace(`${filePathSegs.join(".")}.`, "") : key;
    const resourceUri = vscode.Uri.file(path.join(publicCtx.langDir, lang, ...filePathSegs) + `.${publicCtx.langFileType}`);
    await selectProperty(resourceUri, realKey);
  });

  registerDisposable(disposable);
}
