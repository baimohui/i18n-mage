import * as vscode from "vscode";
import { t } from "@/utils/i18n";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { ActiveEditorState } from "@/utils/activeEditorState";
import LangMage from "@/core/LangMage";

export function registerSearchCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.search", async () => {
    let defaultValue = treeInstance.globalFilter.text;
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      defaultValue = editor.document.getText(editor.selection);
    } else {
      const keyAtCursor = ActiveEditorState.keyAtCursor;
      const mage = LangMage.getInstance();
      const { countryMap } = mage.langDetail;
      const displayLang = treeInstance.displayLang;
      const displayValue = countryMap[displayLang][keyAtCursor];
      if (displayValue) {
        defaultValue = displayValue;
      }
    }
    const keyword = await vscode.window.showInputBox({
      placeHolder: t("command.searchEntry.placeHolder"),
      prompt: t("command.searchEntry.prompt"),
      value: defaultValue
    });
    if (keyword !== undefined && keyword.trim() !== "") {
      treeInstance.setSearch(keyword.trim());
      vscode.commands.executeCommand("workbench.view.extension.i18nMage");
    }
  });
  registerDisposable(disposable);
}
