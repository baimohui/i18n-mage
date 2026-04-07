import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { LangContextPublic, TEntry, UNMATCHED_LANGUAGE_ACTION, UnmatchedLanguageAction } from "@/types";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { ExtendedTreeItem } from "./tree/models";
import { matchesSearch as matchesSearchHelper } from "./tree/searchHelpers";
import { getSyncPercent } from "./tree/syncHelpers";
import { getUsageData } from "./tree/usageHelpers";
import { resolveEntryKeyFromName } from "@/utils/regex";
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
  isSourceLangOnly = false;
  searchNavigationLocations: SearchNavigationLocation[] = [];
  searchNavigationCursor = -1;

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
    this.updateSearchNavigationLocations();
  }

  setSearch(keyword: string) {
    this.isSearching = true;
    this.globalFilter.text = keyword;
    this.searchNavigationCursor = -1;
    vscode.commands.executeCommand("setContext", "i18nMage.isSearching", this.isSearching);
    this.refresh();
  }

  cancelSearch() {
    this.isSearching = false;
    this.searchNavigationLocations = [];
    this.searchNavigationCursor = -1;
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

  toggleSourceLangOnly() {
    this.isSourceLangOnly = !this.isSourceLangOnly;
    vscode.commands.executeCommand("setContext", "i18nMage.isSourceLangOnly", this.isSourceLangOnly);
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
      genId: (element, name) => this.genId(element, name),
      getSearchNavigationDescription: () => this.getSearchNavigationDescription(),
      hasSearchNavigationResult: () => this.searchNavigationLocations.length > 0
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
      isSourceLangOnly: this.isSourceLangOnly,
      filterText: this.globalFilter.text,
      dictionary: this.dictionary,
      referredLang: this.publicCtx.referredLang
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

  navigateSearchResult(direction: SearchNavigationDirection): void {
    if (!this.isSearching || this.searchNavigationLocations.length === 0) return;

    const editorAnchor = this.getEditorSearchNavigationAnchor();
    const location = this.getNextSearchNavigationLocation(direction, editorAnchor);
    if (!location) return;

    this.searchNavigationCursor = location.globalIndex;
    void this.openSearchNavigationLocation(location);
    this._onDidChangeTreeData.fire();
  }

  private getSearchNavigationDescription(): string {
    const total = this.searchNavigationLocations.length;
    if (!this.isSearching || total === 0) return "";

    const safeCursor = this.searchNavigationCursor >= 0 ? this.searchNavigationCursor % total : 0;
    const current = this.searchNavigationLocations[safeCursor];

    return t("tree.search.navigationPosition", current.fileEntryIndex + 1, current.fileEntryCount, safeCursor + 1, total);
  }

  private updateSearchNavigationLocations(): void {
    if (!this.isSearching) {
      this.searchNavigationLocations = [];
      this.searchNavigationCursor = -1;
      return;
    }

    const previousLocationId = this.searchNavigationLocations[this.searchNavigationCursor]?.id;
    const perFile: Record<string, Omit<SearchNavigationLocation, "globalIndex" | "fileEntryIndex" | "fileEntryCount">[]> = {};
    const appendLocation = (filePath: string, pos: string) => {
      const [startRaw, endRaw] = pos.split(",");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (Number.isNaN(start) || Number.isNaN(end)) return;

      perFile[filePath] ??= [];
      perFile[filePath].push({
        id: `${filePath}:${start},${end}`,
        filePath,
        range: [start, end]
      });
    };

    const usedMap = this.usedEntryMap;
    Object.entries(usedMap).forEach(([entryName, usageByFile]) => {
      const key = resolveEntryKeyFromName(this.tree, entryName);
      if (key === undefined || key === "") return;
      if (!this.matchesSearch(key)) return;
      Object.entries(usageByFile).forEach(([filePath, set]) => {
        Array.from(set).forEach(pos => appendLocation(filePath, pos));
      });
    });

    const undefinedMap = this.undefinedEntryMap;
    Object.entries(undefinedMap).forEach(([rawText, usageByFile]) => {
      if (!this.matchesSearch(rawText)) return;
      Object.entries(usageByFile).forEach(([filePath, set]) => {
        Array.from(set).forEach(pos => appendLocation(filePath, pos));
      });
    });

    const filePaths = Object.keys(perFile).sort((a, b) => a.localeCompare(b));
    const next: SearchNavigationLocation[] = [];
    filePaths.forEach(filePath => {
      const entries = perFile[filePath].sort((a, b) => {
        const diff = a.range[0] - b.range[0];
        return diff === 0 ? a.range[1] - b.range[1] : diff;
      });
      const fileEntryCount = entries.length;
      entries.forEach((entry, fileEntryIndex) => {
        next.push({
          ...entry,
          globalIndex: next.length,
          fileEntryIndex,
          fileEntryCount
        });
      });
    });

    this.searchNavigationLocations = next;
    if (next.length === 0) {
      this.searchNavigationCursor = -1;
      return;
    }

    if (previousLocationId !== undefined && previousLocationId !== "") {
      const matchedIndex = next.findIndex(item => item.id === previousLocationId);
      if (matchedIndex >= 0) {
        this.searchNavigationCursor = matchedIndex;
        return;
      }
    }

    if (this.searchNavigationCursor < 0) {
      this.searchNavigationCursor = 0;
      return;
    }

    this.searchNavigationCursor = this.searchNavigationCursor % next.length;
  }

  private getNextSearchNavigationLocation(
    direction: SearchNavigationDirection,
    anchor?: SearchNavigationAnchor
  ): SearchNavigationLocation | undefined {
    const total = this.searchNavigationLocations.length;
    if (total === 0) return undefined;

    const uniqueFiles = this.getSearchNavigationFileList();
    if (anchor) {
      const anchored = this.getAnchoredSearchNavigationLocation(direction, anchor, uniqueFiles);
      if (anchored) return anchored;
    }

    const currentIndex = this.searchNavigationCursor >= 0 ? this.searchNavigationCursor % total : 0;
    const current = this.searchNavigationLocations[currentIndex];

    const offsetIndex = (index: number, delta: number, size: number) => {
      if (size <= 0) return 0;
      return (((index + delta) % size) + size) % size;
    };

    if (direction === "nextEntry" || direction === "previousEntry") {
      const currentFileItems = this.searchNavigationLocations.filter(item => item.filePath === current.filePath);
      if (currentFileItems.length === 0) return current;
      const fileIndex = current.fileEntryIndex;
      const nextFileIndex = offsetIndex(fileIndex, direction === "nextEntry" ? 1 : -1, currentFileItems.length);
      return currentFileItems[nextFileIndex];
    }

    const currentFileIndex = uniqueFiles.findIndex(file => file === current.filePath);
    if (currentFileIndex === -1 || uniqueFiles.length === 0) return current;

    const nextFileIndex = offsetIndex(currentFileIndex, direction === "nextFile" ? 1 : -1, uniqueFiles.length);
    const nextFilePath = uniqueFiles[nextFileIndex];
    const targetFileItems = this.searchNavigationLocations.filter(item => item.filePath === nextFilePath);
    if (targetFileItems.length === 0) return current;

    return direction === "nextFile" ? targetFileItems[0] : targetFileItems[targetFileItems.length - 1];
  }

  private async openSearchNavigationLocation(location: SearchNavigationLocation): Promise<void> {
    const fileUri = vscode.Uri.file(location.filePath);
    const document = await vscode.workspace.openTextDocument(fileUri);
    const [start, end] = location.range;
    const selection = new vscode.Range(document.positionAt(start), document.positionAt(end));
    this.showSearchNavigationStatusBarMessage(location);
    await vscode.window.showTextDocument(fileUri, { selection, preserveFocus: true, preview: false });
  }

  private getEditorSearchNavigationAnchor(): SearchNavigationAnchor | undefined {
    if (this.searchNavigationLocations.length === 0) return undefined;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return undefined;
    return {
      filePath: editor.document.uri.fsPath,
      offset: editor.document.offsetAt(editor.selection.active)
    };
  }

  private showSearchNavigationStatusBarMessage(location: SearchNavigationLocation): void {
    const total = this.searchNavigationLocations.length;
    if (total === 0) return;

    NotificationManager.setStatusBarMessage(
      t("tree.search.navigationStatusBar", location.fileEntryIndex + 1, location.fileEntryCount, location.globalIndex + 1, total),
      4500
    );
  }

  private getAnchoredSearchNavigationLocation(
    direction: SearchNavigationDirection,
    anchor: SearchNavigationAnchor,
    uniqueFiles: string[]
  ): SearchNavigationLocation | undefined {
    const offsetIndex = (index: number, delta: number, size: number) => {
      if (size <= 0) return 0;
      return (((index + delta) % size) + size) % size;
    };

    const currentFileItems = this.searchNavigationLocations.filter(item => item.filePath === anchor.filePath);

    if (direction === "nextEntry" || direction === "previousEntry") {
      if (currentFileItems.length === 0) return undefined;
      if (direction === "nextEntry") {
        return currentFileItems.find(item => item.range[0] > anchor.offset) ?? currentFileItems[0];
      }
      return [...currentFileItems].reverse().find(item => item.range[1] <= anchor.offset) ?? currentFileItems[currentFileItems.length - 1];
    }

    const currentFileIndex = uniqueFiles.findIndex(filePath => filePath === anchor.filePath);
    if (currentFileIndex === -1) return undefined;

    const targetFileIndex = offsetIndex(currentFileIndex, direction === "nextFile" ? 1 : -1, uniqueFiles.length);
    const targetFilePath = uniqueFiles[targetFileIndex];
    const targetFileItems = this.searchNavigationLocations.filter(item => item.filePath === targetFilePath);
    if (targetFileItems.length === 0) return undefined;

    return direction === "nextFile" ? targetFileItems[0] : targetFileItems[targetFileItems.length - 1];
  }

  private getSearchNavigationFileList(): string[] {
    const uniqueFiles: string[] = [];
    this.searchNavigationLocations.forEach(item => {
      if (uniqueFiles[uniqueFiles.length - 1] !== item.filePath) {
        uniqueFiles.push(item.filePath);
      }
    });
    return uniqueFiles;
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

type SearchNavigationDirection = "previousFile" | "previousEntry" | "nextEntry" | "nextFile";

type SearchNavigationLocation = {
  id: string;
  filePath: string;
  range: [number, number];
  globalIndex: number;
  fileEntryIndex: number;
  fileEntryCount: number;
};

type SearchNavigationAnchor = {
  filePath: string;
  offset: number;
};
