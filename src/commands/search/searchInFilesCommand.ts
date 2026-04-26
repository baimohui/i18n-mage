import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { getSearchQuickPick } from "@/features/SearchQuickPick";
import { registerDisposable } from "@/utils/dispose";
export function registerSearchInFilesCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.searchInFiles", () => {
    // 如果编辑器有选中文本，优先使用选中文本（保持 VS Code 原生行为）
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      const selectedText = editor.document.getText(editor.selection);
      vscode.commands.executeCommand("workbench.action.findInFiles", {
        query: selectedText
      });
      return;
    }

    // 没有选中文本时，使用插件的搜索关键词
    const quickPick = getSearchQuickPick();
    const keyword = quickPick.isOpen ? quickPick.currentValue : treeInstance.globalFilter.text;
    vscode.commands.executeCommand("workbench.action.findInFiles", {
      query: keyword,
      isCaseSensitive: treeInstance.isCaseSensitive,
      matchWholeWord: treeInstance.isWholeWordMatch
    });
  });
  registerDisposable(disposable);
}
