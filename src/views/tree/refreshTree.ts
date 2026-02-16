import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { LangContextPublic, TEntry, UnmatchedLanguageAction } from "@/types";
import { getCacheConfig } from "@/utils/config";
import { getLangCode } from "@/utils/langKey";
import { getValueByAmbiguousEntryName } from "@/utils/regex";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { DecoratorController } from "@/features/Decorator";
import { Diagnostics } from "@/features/Diagnostics";
import { StatusBarItemManager } from "@/features/StatusBarItemManager";

interface RefreshTreeDeps {
  mage: LangMage;
  isSearching: boolean;
  matchesSearch: (key: string) => boolean;
  currentUnmatchedLanguageAction: UnmatchedLanguageAction;
  setState: (state: {
    publicCtx: LangContextPublic;
    validateLanguageBeforeTranslate: boolean;
    autoTranslateMissingKey: boolean;
    ignorePossibleVariables: boolean;
    unmatchedLanguageAction: UnmatchedLanguageAction;
    displayLang: string;
    definedEntriesInCurrentFile: TEntry[];
    undefinedEntriesInCurrentFile: TEntry[];
  }) => void;
  fireTreeDataChanged: () => void;
}

export function refreshTreeWithDeps(deps: RefreshTreeDeps): void {
  const { mage, isSearching, matchesSearch, setState, fireTreeDataChanged } = deps;
  const publicCtx = mage.getPublicContext();
  const validateLanguageBeforeTranslate = getCacheConfig<boolean>("translationServices.validateLanguageBeforeTranslate", true);
  const autoTranslateMissingKey = getCacheConfig<boolean>("translationServices.autoTranslateMissingKey", false);
  const ignorePossibleVariables = getCacheConfig<boolean>("translationServices.ignorePossibleVariables", true);
  const unmatchedLanguageAction = validateLanguageBeforeTranslate
    ? getCacheConfig<UnmatchedLanguageAction>("translationServices.unmatchedLanguageAction")
    : deps.currentUnmatchedLanguageAction;

  const resolveLang = (target: string) => {
    const targetCode = getLangCode(target);
    const defaultCode = getLangCode(publicCtx.defaultLang);
    return (
      mage.detectedLangList.find(lang => lang === target) ??
      mage.detectedLangList.find(lang => getLangCode(lang) === targetCode) ??
      mage.detectedLangList.find(lang => getLangCode(lang) === defaultCode) ??
      mage.detectedLangList.find(lang => getLangCode(lang) === "en") ??
      mage.detectedLangList[0]
    );
  };
  const displayLang = resolveLang(getCacheConfig<string>("general.displayLanguage"));

  let definedEntriesInCurrentFile: TEntry[] = [];
  let undefinedEntriesInCurrentFile: TEntry[] = [];
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    ActiveEditorState.update(editor);
    const definedEntries = Array.from(ActiveEditorState.definedEntries.values()).map(item => item[0]);
    for (const entry of definedEntries) {
      if (entry.dynamic) {
        const matchedNames = ActiveEditorState.dynamicMatchInfo.get(entry.nameInfo.name) || [];
        matchedNames.forEach(name => {
          if (!definedEntriesInCurrentFile.find(item => item.nameInfo.name === name)) {
            const newEntry = { ...entry, nameInfo: { ...entry.nameInfo, text: name, name: name, id: name } };
            definedEntriesInCurrentFile.push(newEntry);
          }
        });
      } else {
        definedEntriesInCurrentFile.push(entry);
      }
    }
    undefinedEntriesInCurrentFile = Array.from(ActiveEditorState.undefinedEntries.values()).map(item => item[0]);
    if (isSearching) {
      const tree = mage.langDetail.tree;
      definedEntriesInCurrentFile = definedEntriesInCurrentFile.filter(item => {
        const key = getValueByAmbiguousEntryName(tree, item.nameInfo.name) ?? item.nameInfo.name;
        return matchesSearch(key);
      });
      undefinedEntriesInCurrentFile = undefinedEntriesInCurrentFile.filter(item => matchesSearch(item.nameInfo.text));
    }
    const decorator = DecoratorController.getInstance();
    decorator.updateVisibleEditors();
    const diagnostics = Diagnostics.getInstance();
    diagnostics.update(editor.document);
  }

  setState({
    publicCtx,
    validateLanguageBeforeTranslate,
    autoTranslateMissingKey,
    ignorePossibleVariables,
    unmatchedLanguageAction,
    displayLang,
    definedEntriesInCurrentFile,
    undefinedEntriesInCurrentFile
  });

  const statusBarItemManager = StatusBarItemManager.getInstance();
  statusBarItemManager.update();
  fireTreeDataChanged();
}
