import * as vscode from "vscode";
import { getValueByAmbiguousEntryName } from "@/utils/regex";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import LangMage from "@/core/LangMage";
import { ActiveEditorState, DefinedEntryInEditor } from "@/utils/activeEditorState";
import { treeInstance } from "@/views/tree";

export function registerBrowseTranslationsInFileCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.browseTranslationsInFile", async () => {
    const definedEntries = Array.from(ActiveEditorState.definedEntries.values());
    const { dictionary, tree } = mage.langDetail;
    const map = definedEntries.reduce(
      (acc, entries) => {
        const entry = entries[0];
        const entryKey = getValueByAmbiguousEntryName(tree, entry.nameInfo.name);
        if (entryKey !== undefined) {
          const langValue = dictionary[entryKey]?.value?.[treeInstance.displayLang] ?? "";
          if (langValue) {
            acc[langValue] = entry;
          }
        }
        return acc;
      },
      {} as Record<string, DefinedEntryInEditor>
    );
    const translations = Object.keys(map);
    if (translations.length > 0) {
      const translation = await vscode.window.showQuickPick(translations, {
        canPickMany: false,
        placeHolder: t("command.goToReference.selectEntry")
      });
      if (translation === undefined) return;
      const entry = map[translation];
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const [startPos, endPos] = entry.pos.split(",").map(pos => editor.document.positionAt(+pos));
        editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
        editor.selection = new vscode.Selection(startPos, endPos);
      }
    }
  });

  registerDisposable(disposable);
}
