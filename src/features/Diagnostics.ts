import * as vscode from "vscode";
import { t } from "@/utils/i18n";
import { isValidI18nCallablePath } from "@/utils/regex";
import { getCacheConfig } from "@/utils/config";
import { ActiveEditorState } from "@/utils/activeEditorState";

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
    if (!getCacheConfig<boolean>("general.enableDiagnostics")) {
      this.clear(document);
      return;
    }
    const diagnostics: vscode.Diagnostic[] = [];
    const undefinedEntries = Array.from(ActiveEditorState.undefinedEntries.values()).flat();
    for (const entry of undefinedEntries) {
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
