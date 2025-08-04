import * as vscode from "vscode";
import { t } from "@/utils/i18n";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { getConfig } from "@/utils/config";
import { getValueByAmbiguousEntryName, catchTEntries, unescapeString, isValidI18nCallablePath } from "@/utils/regex";

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
    if (this.disposed) return;
    if (!getConfig<boolean>("translationHints.enable", true)) return;
    if (!isValidI18nCallablePath(document.uri.fsPath)) return;
    const mage = LangMage.getInstance();
    const text = document.getText();
    const entries = catchTEntries(text);
    const diagnostics: vscode.Diagnostic[] = [];
    const { tree, countryMap } = mage.langDetail;
    const translations = countryMap[treeInstance.displayLang];
    if (translations === undefined) return;
    const totalEntryList = Object.keys(mage.langDetail.dictionary).map(key => unescapeString(key));

    for (const entry of entries) {
      const entryKey = getValueByAmbiguousEntryName(tree, entry.nameInfo.name);
      const entryValue = translations[entryKey as string];
      if (entryValue === undefined) {
        if (entry.nameInfo.vars.length > 0 && totalEntryList.some(entryName => entry.nameInfo.regex.test(entryName))) {
          continue;
        }
        const [startPos, endPos] = entry.pos.split(",").map(pos => document.positionAt(+pos));
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
