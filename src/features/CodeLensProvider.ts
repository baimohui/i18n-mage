import * as vscode from "vscode";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { t } from "@/utils/i18n";
import { getCacheConfig } from "@/utils/config";
import { isEnglishVariable } from "@/utils/regex";

export class CodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const undefinedEntries = Array.from(ActiveEditorState.undefinedEntries.values()).flat();
    const ignorePossibleVariables = getCacheConfig<boolean>("translationServices.ignorePossibleVariables", true);
    return undefinedEntries.flatMap(entry => {
      const text = entry.nameInfo.text;
      const [startPos, endPos] = entry.pos.split(",").map(pos => doc.positionAt(+pos));
      const range = new vscode.Range(startPos, endPos);
      const codeLens: vscode.CodeLens[] = [];
      if (!ignorePossibleVariables || !isEnglishVariable(text)) {
        codeLens.push(
          new vscode.CodeLens(range, {
            title: t("command.fix.extract"),
            command: "i18nMage.fixUndefinedEntries",
            arguments: [{ data: [text], meta: { scope: doc.uri.fsPath } }]
          })
        );
      }
      codeLens.push(
        new vscode.CodeLens(range, {
          title: t("command.fix.ignore"),
          command: "i18nMage.ignoreUndefined",
          arguments: [{ data: [text] }]
        })
      );
      return codeLens;
    });
  }

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
    vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
  }
}
