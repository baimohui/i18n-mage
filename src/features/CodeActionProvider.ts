import * as vscode from "vscode";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { t } from "@/utils/i18n";
import { getCacheConfig } from "@/utils/config";
import { isEnglishVariable } from "@/utils/regex";

export class CodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection): vscode.CodeAction[] | undefined {
    if (!getCacheConfig<boolean>("general.enableDiagnostics")) return;
    const undefinedEntries = Array.from(ActiveEditorState.undefinedEntries.values()).flat();
    if (undefinedEntries.length === 0) return;

    const ignorePossibleVariables = getCacheConfig<boolean>("translationServices.ignorePossibleVariables", true);

    const actions: vscode.CodeAction[] = [];

    for (const entry of undefinedEntries) {
      const text = entry.nameInfo.text;
      const [startPos, endPos] = entry.pos.split(",").map(pos => document.positionAt(+pos));
      const entryRange = new vscode.Range(startPos, endPos);

      // 只有当当前光标所在范围 intersect 时才提供 CodeAction
      if (!range.intersection(entryRange)) continue;

      // ----------- 创建修复类 CodeAction: 提取词条 -----------
      if (!ignorePossibleVariables || !isEnglishVariable(text)) {
        const extractAction = new vscode.CodeAction(t("command.fix.extract"), vscode.CodeActionKind.QuickFix);
        extractAction.command = {
          title: t("command.fix.extract"),
          command: "i18nMage.fixUndefinedEntries",
          arguments: [{ data: [text], meta: { file: document.uri.fsPath } }]
        };
        extractAction.diagnostics = this.findDiagnosticsForRange(entryRange);
        extractAction.isPreferred = true; // VSCode 会优先显示
        actions.push(extractAction);
      }

      // ----------- 创建修复类 CodeAction: 忽略词条 -----------
      const ignoreAction = new vscode.CodeAction(t("command.fix.ignore"), vscode.CodeActionKind.QuickFix);
      ignoreAction.command = {
        title: t("command.fix.ignore"),
        command: "i18nMage.ignoreUndefined",
        arguments: [{ data: [text] }]
      };
      ignoreAction.diagnostics = this.findDiagnosticsForRange(entryRange);
      actions.push(ignoreAction);
    }

    return actions;
  }

  private findDiagnosticsForRange(range: vscode.Range): vscode.Diagnostic[] {
    const diagnostics = vscode.languages.getDiagnostics();
    const matched: vscode.Diagnostic[] = [];

    for (const [uri, diags] of diagnostics) {
      if (uri === undefined) continue;
      for (const d of diags) {
        if (d.range.intersection(range)) matched.push(d);
      }
    }

    return matched;
  }
}
