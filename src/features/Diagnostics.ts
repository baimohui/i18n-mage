import * as vscode from "vscode";
import { t } from "@/utils/i18n";
import LangMage from "@/core/LangMage";
import { getConfig } from "@/utils/config";
import { isSamePath } from "@/utils/fs";
import { getValueByAmbiguousEntryName, catchTEntries, unescapeString, normalizeEntryName } from "@/utils/regex";

export class Diagnostics {
  private static instance: Diagnostics;
  private collection: vscode.DiagnosticCollection;
  private disposed = false;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("i18nMage");
  }

  public static getInstance(): Diagnostics {
    if (Diagnostics.instance === undefined || Diagnostics.instance.disposed) {
      Diagnostics.instance = new Diagnostics();
    }
    return Diagnostics.instance;
  }

  public update(document: vscode.TextDocument) {
    // if (document.languageId !== "javascript" && document.languageId !== "typescript") {
    //   return;
    // }
    if (this.disposed) return;
    if (!getConfig<boolean>("translationHints.enable", true)) return;
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    const ignoredFileList = getConfig<string[]>("workspace.ignoredFileList", []);
    if (ignoredFileList.some(ifp => isSamePath(document.uri.fsPath, ifp))) return;

    const text = document.getText();
    const entries = catchTEntries(text, mage.i18nFeatures);
    const diagnostics: vscode.Diagnostic[] = [];
    const { tree, countryMap } = mage.langDetail;
    const translations = countryMap[publicCtx.referredLang];
    const totalEntryList = Object.keys(mage.langDetail.dictionary).map(key => unescapeString(key));

    for (const entry of entries) {
      const entryName = normalizeEntryName(entry.nameInfo.text, mage.i18nFeatures);
      const entryKey = getValueByAmbiguousEntryName(tree, entryName);
      const entryValue = translations[entryKey as string];
      if (entryValue === undefined) {
        if (entry.nameInfo.vars.length > 0 && totalEntryList.some(entryName => entry.nameInfo.regex.test(entryName))) {
          continue;
        }
        const startPos = document.positionAt(entry.pos[0]);
        const endPos = document.positionAt(entry.pos[1]);
        const range = new vscode.Range(startPos, endPos);
        const diagnostic = new vscode.Diagnostic(
          range,
          t("diagnostics.undefinedWarn", entry.nameInfo.text),
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = "i18n Mage";
        diagnostics.push(diagnostic);
      }
    }

    this.collection.set(document.uri, diagnostics);
  }

  public clear(document: vscode.TextDocument) {
    this.collection.delete(document.uri);
  }

  public dispose() {
    this.collection.dispose();
    this.disposed = true;
  }
}
