import * as vscode from "vscode";
import { t } from "@/utils/i18n";
import LangMage from "@/core/LangMage";
import { getConfig } from "@/utils/config";
import { isSamePath } from "@/utils/fs";
import { getValueByAmbiguousEntryName, catchTEntries } from "@/utils/regex";

export class Diagnostics {
  private static instance: Diagnostics;
  private collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("i18nMage");
  }

  public static getInstance(): Diagnostics {
    if (Diagnostics.instance === undefined) {
      Diagnostics.instance = new Diagnostics();
    }
    return Diagnostics.instance;
  }

  public update(document: vscode.TextDocument) {
    // if (document.languageId !== "javascript" && document.languageId !== "typescript") {
    //   return;
    // }
    if (!getConfig<boolean>("translationHints.enabled", true)) return;
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    const ignoredFileList = getConfig<string[]>("ignoredFileList", []);
    if (ignoredFileList.some(ifp => isSamePath(document.uri.fsPath, ifp))) return;

    const text = document.getText();
    const entries = catchTEntries(text);
    const diagnostics: vscode.Diagnostic[] = [];
    const { tree, countryMap } = mage.langDetail;
    const translations = countryMap[publicCtx.referredLang];

    for (const entry of entries) {
      const entryText = entry.nameInfo.text;
      const entryKey = getValueByAmbiguousEntryName(tree, entryText);
      const entryValue = translations[entryKey as string];
      if (entryValue === undefined) {
        const startPos = document.positionAt(entry.pos);
        const endPos = document.positionAt(entry.pos + entryText.length);
        const range = new vscode.Range(startPos, endPos);
        const diagnostic = new vscode.Diagnostic(range, t("diagnostics.undefinedWarn", entryText), vscode.DiagnosticSeverity.Warning);
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
  }
}
