import path from "path";
import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { getFileLocationFromId, selectProperty } from "@/utils/regex";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";

export function registerGoToDefinitionCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.goToDefinition",
    async (e: { data: { key: string; lang: string } } | undefined) => {
      let target: { key: string; lang: string } | undefined = undefined;
      if (e === undefined) {
        const dictionary = mage.langDetail.dictionary;
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
        target = e.data;
      }
      const { key, lang } = target;
      const publicCtx = mage.getPublicContext();
      let filePathSegs: string[] = [];
      if (publicCtx.fileStructure?.children) {
        filePathSegs = getFileLocationFromId(key, publicCtx.fileStructure.children[lang]) ?? [];
      }
      const realKey = filePathSegs.length > 0 ? key.replace(`${filePathSegs.join(".")}.`, "") : key;
      const resourceUri = vscode.Uri.file(path.join(publicCtx.langPath, lang, ...filePathSegs) + `.${publicCtx.langFileType}`);
      await selectProperty(resourceUri, realKey);
    }
  );

  registerDisposable(disposable);
}
