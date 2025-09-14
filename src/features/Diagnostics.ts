import * as vscode from "vscode";
import { t } from "@/utils/i18n";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { getValueByAmbiguousEntryName, catchTEntries, unescapeString, isValidI18nCallablePath } from "@/utils/regex";
import { getConfig } from "@/utils/config";

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
    if (!isValidI18nCallablePath(document.uri.fsPath)) return;
    if (!getConfig<boolean>("general.enableDiagnostics", true)) {
      this.clear(document);
      return;
    }
    const mage = LangMage.getInstance();
    const text = document.getText();
    const entries = catchTEntries(text);
    const diagnostics: vscode.Diagnostic[] = [];
    const { tree, countryMap } = mage.langDetail;
    const publicCtx = mage.getPublicContext();
    const translations = countryMap[treeInstance.displayLang];
    if (translations === undefined) return;
    const totalEntryList = Object.keys(mage.langDetail.dictionary).map(key => unescapeString(key));

    for (const entry of entries) {
      if (publicCtx.ignoredUndefinedEntries.includes(entry.nameInfo.name)) continue;
      const entryKey = getValueByAmbiguousEntryName(tree, entry.nameInfo.name) ?? "";
      if (!entryKey || translations[entryKey] === undefined) {
        if (entry.nameInfo.vars.length > 0 && totalEntryList.some(entryName => entry.nameInfo.regex.test(entryName))) continue;
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
