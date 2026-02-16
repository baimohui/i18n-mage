import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { LangContextPublic, TEntry, UNMATCHED_LANGUAGE_ACTION, UnmatchedLanguageAction } from "@/types";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { ExtendedTreeItem } from "./tree/models";
import { matchesSearch as matchesSearchHelper } from "./tree/searchHelpers";
import { getSyncPercent } from "./tree/syncHelpers";
import { getUsageData } from "./tree/usageHelpers";
import {
  getCurrentFileChildren as getCurrentFileChildrenSection,
  getDictionaryChildren as getDictionaryChildrenSection,
  getRootChildren as getRootChildrenSection,
  getSyncInfoChildren as getSyncInfoChildrenSection,
  getUsageInfoChildren as getUsageInfoChildrenSection,
  TreeSectionContext
} from "./tree/sections";
import { initTreeWithDeps } from "./tree/initTree";
import { refreshTreeWithDeps } from "./tree/refreshTree";

class TreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  #mage: LangMage;
  publicCtx: LangContextPublic;
  isInitialized = false;
  isSyncing: boolean | string[] = false;
  displayLang = "";
  validateLanguageBeforeTranslate = true;
  autoTranslateMissingKey = false;
  ignorePossibleVariables = true;
  unmatchedLanguageAction: UnmatchedLanguageAction = UNMATCHED_LANGUAGE_ACTION.ignore;
  usedEntries: TEntry[] = [];
  definedEntriesInCurrentFile: TEntry[] = [];
  undefinedEntriesInCurrentFile: TEntry[] = [];
  globalFilter: { text: string } = { text: "" };
  isSearching = false;
  isWholeWordMatch = false;
  isCaseSensitive = false;

  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor() {
    this.#mage = LangMage.getInstance();
    this.publicCtx = this.#mage.getPublicContext();
  }

  get langInfo() {
    return this.#mage.langDetail;
  }

  get dictionary() {
    return this.langInfo.dictionary;
  }

  get countryMap() {
    return this.langInfo.countryMap;
  }

  get tree() {
    return this.langInfo.tree;
  }

  get usedEntryMap() {
    return this.langInfo.used ?? {};
  }

  get undefinedEntryMap() {
    return this.langInfo.undefined ?? {};
  }

  get usedKeySet() {
    return this.langInfo.usedKeySet;
  }

  get unusedKeySet() {
    return this.langInfo.unusedKeySet;
  }

  refresh(): void {
    refreshTreeWithDeps({
      mage: this.#mage,
      isSearching: this.isSearching,
      matchesSearch: key => this.matchesSearch(key),
      currentUnmatchedLanguageAction: this.unmatchedLanguageAction,
      setState: state => {
        this.publicCtx = state.publicCtx;
        this.validateLanguageBeforeTranslate = state.validateLanguageBeforeTranslate;
        this.autoTranslateMissingKey = state.autoTranslateMissingKey;
        this.ignorePossibleVariables = state.ignorePossibleVariables;
        this.unmatchedLanguageAction = state.unmatchedLanguageAction;
        this.displayLang = state.displayLang;
        this.definedEntriesInCurrentFile = state.definedEntriesInCurrentFile;
        this.undefinedEntriesInCurrentFile = state.undefinedEntriesInCurrentFile;
      },
      fireTreeDataChanged: () => this._onDidChangeTreeData.fire()
    });
  }

  setSearch(keyword: string) {
    this.isSearching = true;
    this.globalFilter.text = keyword;
    vscode.commands.executeCommand("setContext", "i18nMage.isSearching", this.isSearching);
    this.refresh();
  }

  cancelSearch() {
    this.isSearching = false;
    vscode.commands.executeCommand("setContext", "i18nMage.isSearching", false);
    this.refresh();
  }

  toggleWholeWordMatch() {
    this.isWholeWordMatch = !this.isWholeWordMatch;
    vscode.commands.executeCommand("setContext", "i18nMage.isWholeWordMatch", this.isWholeWordMatch);
    this.refresh();
  }

  toggleCaseSensitive() {
    this.isCaseSensitive = !this.isCaseSensitive;
    vscode.commands.executeCommand("setContext", "i18nMage.isCaseSensitive", this.isCaseSensitive);
    this.refresh();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ExtendedTreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    try {
      if (!this.publicCtx.langPath) {
        return [];
      }

      if (!element) {
        return this.getRootChildren();
      }
      switch (element.root) {
        case "SEARCH_STATUS":
          return [];
        case "CURRENT_FILE":
          return this.getCurrentFileChildren(element);
        case "SYNC_INFO":
          return this.getSyncInfoChildren(element);
        case "USAGE_INFO":
          return this.getUsageInfoChildren(element);
        case "DICTIONARY":
          return this.getDictionaryChildren(element);
        default:
          return [];
      }
    } catch (e: unknown) {
      const errorMessage = t("tree.getChildren.error", e instanceof Error ? e.message : (e as string));
      NotificationManager.showError(errorMessage);
      return [];
    }
  }

  async initTree(): Promise<boolean> {
    return initTreeWithDeps({
      mage: this.#mage,
      getPublicCtx: () => this.publicCtx,
      setPublicCtx: ctx => {
        this.publicCtx = ctx;
      },
      setInitialized: initialized => {
        this.isInitialized = initialized;
      },
      refresh: () => this.refresh()
    });
  }

  private getSectionContext(): TreeSectionContext {
    return {
      publicCtx: this.publicCtx,
      langInfo: this.langInfo,
      detectedLangList: this.#mage.detectedLangList,
      isSearching: this.isSearching,
      globalFilterText: this.globalFilter.text,
      isSyncing: this.isSyncing,
      displayLang: this.displayLang,
      validateLanguageBeforeTranslate: this.validateLanguageBeforeTranslate,
      autoTranslateMissingKey: this.autoTranslateMissingKey,
      ignorePossibleVariables: this.ignorePossibleVariables,
      unmatchedLanguageAction: this.unmatchedLanguageAction,
      definedEntriesInCurrentFile: this.definedEntriesInCurrentFile,
      undefinedEntriesInCurrentFile: this.undefinedEntriesInCurrentFile,
      matchesSearch: key => this.matchesSearch(key),
      getSyncPercent: () => this.getSyncPercent(),
      getUsagePercent: () => this.getUsagePercent(),
      genId: (element, name) => this.genId(element, name)
    };
  }

  private getRootChildren(): ExtendedTreeItem[] {
    return getRootChildrenSection(this.getSectionContext());
  }

  private getCurrentFileChildren(element: ExtendedTreeItem): ExtendedTreeItem[] {
    return getCurrentFileChildrenSection(this.getSectionContext(), element);
  }

  private getSyncInfoChildren(element: ExtendedTreeItem): ExtendedTreeItem[] {
    return getSyncInfoChildrenSection(this.getSectionContext(), element);
  }

  private async getUsageInfoChildren(element: ExtendedTreeItem): Promise<ExtendedTreeItem[]> {
    return getUsageInfoChildrenSection(this.getSectionContext(), element);
  }

  private getDictionaryChildren(element: ExtendedTreeItem): ExtendedTreeItem[] {
    return getDictionaryChildrenSection(this.getSectionContext(), element);
  }

  private matchesSearch(key: string) {
    return matchesSearchHelper({
      key,
      isSearching: this.isSearching,
      isCaseSensitive: this.isCaseSensitive,
      isWholeWordMatch: this.isWholeWordMatch,
      filterText: this.globalFilter.text,
      dictionary: this.dictionary
    });
  }

  private getSyncPercent(): string {
    return getSyncPercent({
      lack: this.langInfo.lack,
      null: this.langInfo.null,
      syncBasedOnReferredEntries: this.publicCtx.syncBasedOnReferredEntries,
      referredLang: this.publicCtx.referredLang,
      countryMap: this.countryMap,
      dictionary: this.dictionary
    });
  }

  private getUsagePercent(): string {
    if (this.isSearching) {
      const usageData = getUsageData({
        usedKeySet: this.usedKeySet,
        unusedKeySet: this.unusedKeySet,
        undefinedEntryMap: this.undefinedEntryMap,
        isMatch: key => this.matchesSearch(key)
      });
      const totalCount = usageData.used.keys.length + usageData.unused.keys.length + usageData.undefined.keys.length;
      return String(totalCount);
    }
    const total = Object.keys(this.dictionary).length;
    if (total === 0) return "";
    return Math.floor(Number(((this.usedKeySet.size / total) * 10000).toFixed(0))) / 100 + "%";
  }

  private genId(element: ExtendedTreeItem, name: string): string {
    return `${element.id},${name}`;
  }
}

const treeInstance = new TreeProvider();

export { treeInstance };
