import * as vscode from "vscode";
import { getValueByAmbiguousEntryName, internalToDisplayName, unescapeString } from "@/utils/regex";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import LangMage from "@/core/LangMage";
import { ActiveEditorState, DefinedEntryInEditor } from "@/utils/activeEditorState";
import { treeInstance } from "@/views/tree";
import { getCacheConfig } from "@/utils/config";
import { COMPLETION_DISPLAY_LANGUAGE_SOURCE, COMPLETION_MATCH_SCOPE, CompletionDisplayLanguageSource, CompletionMatchScope } from "@/types";

interface BrowseTranslationQuickPickItem extends vscode.QuickPickItem {
  entry: DefinedEntryInEditor;
}

function getQuickPickDisplayLanguage(displayLanguageSource: CompletionDisplayLanguageSource, referredLang: string) {
  if (displayLanguageSource === COMPLETION_DISPLAY_LANGUAGE_SOURCE.display) {
    return getCacheConfig<string>("general.displayLanguage") || treeInstance.displayLang || referredLang;
  }
  return referredLang;
}

function createQuickPickItem(
  entry: DefinedEntryInEditor,
  key: string,
  value: string,
  matchScope: CompletionMatchScope
): BrowseTranslationQuickPickItem {
  if (matchScope === COMPLETION_MATCH_SCOPE.key) {
    return {
      label: key,
      description: value,
      entry
    };
  }

  return {
    label: value || key,
    description: key,
    entry
  };
}

export function registerBrowseTranslationsInFileCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.browseTranslationsInFile", async () => {
    const definedEntries = Array.from(ActiveEditorState.definedEntries.values());
    const { dictionary, tree } = mage.langDetail;
    const publicCtx = mage.getPublicContext();

    const displayLanguageSource = getCacheConfig<CompletionDisplayLanguageSource>(
      "completion.displayLanguageSource",
      COMPLETION_DISPLAY_LANGUAGE_SOURCE.source
    );
    const matchScope = getCacheConfig<CompletionMatchScope>("completion.matchScope", COMPLETION_MATCH_SCOPE.both);
    const valueLanguage = getQuickPickDisplayLanguage(displayLanguageSource, publicCtx.referredLang);

    const visitedKeySet = new Set<string>();
    const quickPickItems: BrowseTranslationQuickPickItem[] = [];

    definedEntries.forEach(entries => {
      const entry = entries[0];
      const entryKey = getValueByAmbiguousEntryName(tree, entry.nameInfo.name);
      if (entryKey === undefined || visitedKeySet.has(entryKey)) return;

      const valueByTargetLanguage = dictionary[entryKey]?.value?.[valueLanguage] ?? "";
      const fallbackValue = dictionary[entryKey]?.value?.[publicCtx.referredLang] ?? "";
      const displayValue = valueByTargetLanguage || fallbackValue;
      const displayKey = internalToDisplayName(unescapeString(entryKey));

      quickPickItems.push(createQuickPickItem(entry, displayKey, displayValue, matchScope));
      visitedKeySet.add(entryKey);
    });

    if (quickPickItems.length > 0) {
      const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
        canPickMany: false,
        matchOnDescription: matchScope === COMPLETION_MATCH_SCOPE.both,
        placeHolder: t("command.goToReference.selectEntry")
      });
      if (selectedItem === undefined) return;

      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const [startPos, endPos] = selectedItem.entry.pos.split(",").map(pos => editor.document.positionAt(+pos));
        editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
        editor.selection = new vscode.Selection(startPos, endPos);
      }
    }
  });

  registerDisposable(disposable);
}
