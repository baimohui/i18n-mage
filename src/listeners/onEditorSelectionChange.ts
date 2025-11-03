import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { debounce } from "@/utils/common";

export function registerOnEditorSelectionChange(context: vscode.ExtensionContext) {
  const decorator = DecoratorController.getInstance();
  const debouncedHandler = debounce(async (event: vscode.TextEditorSelectionChangeEvent) => {
    decorator.handleCursorMove(event);
    const editor = event.textEditor;
    const key = getKeyAtCursor(editor);
    vscode.commands.executeCommand("setContext", "i18nMage.inKey", key !== undefined);
    await context.workspaceState.update("keyAtCursor", key);
  }, 200);
  const disposable = vscode.window.onDidChangeTextEditorSelection(debouncedHandler);
  registerDisposable(decorator);
  registerDisposable(disposable);
}

// 获取光标下的 key
function getKeyAtCursor(editor: vscode.TextEditor): string | undefined {
  const pos = editor.selection.active;
  const wordRange = editor.document.getWordRangeAtPosition(pos, /[\w.-]+/);
  return wordRange ? editor.document.getText(wordRange) : undefined;
}
