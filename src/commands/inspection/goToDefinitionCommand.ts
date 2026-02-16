import path from "path";
import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { getFileLocationFromId, selectProperty } from "@/utils/regex";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";

export function registerGoToDefinitionCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.goToDefinition", async (e?: { key: string; meta: { lang: string } }) => {
    const publicCtx = mage.getPublicContext();
    let target: { key: string; lang: string } | undefined = undefined;
    const dictionary = mage.langDetail.dictionary;
    if (e === undefined) {
      const key = await vscode.window.showQuickPick(Object.keys(dictionary), {
        canPickMany: false,
        placeHolder: t("command.goToDefinition.selectEntry")
      });
      if (key === undefined) return;
      const lang = await vscode.window.showQuickPick(mage.langDetail.langList, {
        canPickMany: false,
        placeHolder: t("command.goToDefinition.selectLang")
      });
      if (lang === undefined) return;
      target = { key, lang };
    } else {
      target = { key: e.key, lang: e.meta.lang };
    }
    const { key, lang } = target;
    const entry = dictionary[key];
    if (entry === undefined) return;
    const fullKey = entry.fullPath;
    let filePathSegs: string[] = [];
    if (publicCtx.fileStructure !== null) {
      filePathSegs = getFileLocationFromId(fullKey, publicCtx.fileStructure) ?? [];
    }
    const realKey = filePathSegs.length > 0 ? fullKey.replace(`${filePathSegs.join(".")}.`, "") : fullKey;
    const resourceUri = vscode.Uri.file(path.join(publicCtx.langPath, lang, ...filePathSegs) + `.${publicCtx.langFileType}`);
    await selectProperty(resourceUri, realKey);
  });

  registerDisposable(disposable);
}
