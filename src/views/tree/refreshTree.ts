import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { LangContextPublic, TEntry, UnmatchedLanguageAction } from "@/types";
import { getCacheConfig } from "@/utils/config";
import { getLangCode } from "@/utils/langKey";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { DecoratorController } from "@/features/Decorator";
import { Diagnostics } from "@/features/Diagnostics";
import { StatusBarItemManager } from "@/features/StatusBarItemManager";
import { getDefinedEntriesWithDynamicMatches } from "@/utils/definedEntries";

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
    definedEntriesInCurrentFile = getDefinedEntriesWithDynamicMatches(mage.langDetail.tree);
    undefinedEntriesInCurrentFile = Array.from(ActiveEditorState.undefinedEntries.values()).map(item => item[0]);
    if (isSearching) {
      definedEntriesInCurrentFile = definedEntriesInCurrentFile.filter(item => {
        const key = item.nameInfo.key || item.nameInfo.name;
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
