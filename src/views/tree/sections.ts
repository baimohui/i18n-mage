import * as vscode from "vscode";
import { EntryTree, LangContextPublic, TEntry, UNMATCHED_LANGUAGE_ACTION, UnmatchedLanguageAction } from "@/types";
import { t } from "@/utils/i18n";
import { getLangText } from "@/utils/langKey";
import { toRelativePath } from "@/utils/fs";
import {
  escapeMarkdown,
  getValueByAmbiguousEntryName,
  internalToDisplayName,
  isEnglishVariable,
  unescapeString,
  validateLang
} from "@/utils/regex";
import { ExtendedTreeItem, FileItem } from "./models";
import { countDictionaryLeaves, getFilteredDictionaryTreeNode } from "./searchHelpers";
import { checkLangSyncInfo, getSyncInfo } from "./syncHelpers";
import { createUsageTreeItem, getUsageData } from "./usageHelpers";

type LangDetailView = {
  dictionary: Record<string, { value: Record<string, string> }>;
  countryMap: Record<string, Record<string, string>>;
  tree: EntryTree;
  used?: Record<string, Record<string, Set<string>>>;
  undefined?: Record<string, Record<string, Set<string>>>;
  usedKeySet: Set<string>;
  unusedKeySet: Set<string>;
  langList: string[];
  lack: Record<string, string[]>;
  extra: Record<string, string[]>;
  null: Record<string, string[]>;
};

export interface TreeSectionContext {
  publicCtx: LangContextPublic;
  langInfo: LangDetailView;
  detectedLangList: string[];
  isSearching: boolean;
  globalFilterText: string;
  isSyncing: boolean | string[];
  displayLang: string;
  validateLanguageBeforeTranslate: boolean;
  autoTranslateMissingKey: boolean;
  ignorePossibleVariables: boolean;
  unmatchedLanguageAction: UnmatchedLanguageAction;
  definedEntriesInCurrentFile: TEntry[];
  undefinedEntriesInCurrentFile: TEntry[];
  matchesSearch: (key: string) => boolean;
  getSyncPercent: () => string;
  getUsagePercent: () => string;
  genId: (element: ExtendedTreeItem, name: string) => string;
}

export function getRootChildren(ctx: TreeSectionContext): ExtendedTreeItem[] {
  const rootSections: ExtendedTreeItem[] = [];

  if (ctx.isSearching) {
    rootSections.push({
      level: 0,
      label: `${t("tree.search.label")}: ${ctx.globalFilterText}`,
      id: "SEARCH_STATUS",
      root: "SEARCH_STATUS",
      iconPath: new vscode.ThemeIcon("search"),
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      description: "",
      tooltip: t("tree.search.tooltip"),
      command: {
        command: "i18nMage.search",
        title: t("tree.search.title")
      }
    });
  }

  rootSections.push({
    level: 0,
    label: t("tree.currentFile.title"),
    id: "CURRENT_FILE",
    root: "CURRENT_FILE",
    iconPath: new vscode.ThemeIcon("file"),
    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
    description: String(ctx.definedEntriesInCurrentFile.length + ctx.undefinedEntriesInCurrentFile.length)
  });

  if (!ctx.isSearching) {
    rootSections.push({
      level: 0,
      label: t("tree.syncInfo.title"),
      id: "SYNC_INFO",
      root: "SYNC_INFO",
      contextValue: "checkSync",
      tooltip: toRelativePath(ctx.publicCtx.langPath),
      iconPath: new vscode.ThemeIcon(ctx.isSyncing !== false ? "sync~spin" : "sync"),
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      description: ctx.getSyncPercent()
    });
  }

  rootSections.push({
    level: 0,
    label: t("tree.usedInfo.title"),
    id: "USAGE_INFO",
    root: "USAGE_INFO",
    contextValue: "checkUsage",
    iconPath: new vscode.ThemeIcon("graph"),
    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
    description: ctx.getUsagePercent()
  });

  const dictionaryCount = ctx.isSearching
    ? countDictionaryLeaves(getFilteredDictionaryTreeNode(ctx.langInfo.tree, key => ctx.matchesSearch(key)))
    : Object.keys(ctx.langInfo.dictionary).length;
  rootSections.push({
    level: 0,
    label: t("tree.dictionary.title"),
    id: "DICTIONARY",
    root: "DICTIONARY",
    contextValue: "PASTE_ENTRIES",
    iconPath: new vscode.ThemeIcon("notebook"),
    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
    description: String(dictionaryCount)
  });

  return rootSections;
}

export function getCurrentFileChildren(ctx: TreeSectionContext, element: ExtendedTreeItem): ExtendedTreeItem[] {
  if (element.level === 0) {
    const definedContextValueList = ["definedEntriesInCurFile"];
    if (ctx.definedEntriesInCurrentFile.length > 0) {
      definedContextValueList.push("COPY_ENTRIES");
    }
    let undefinedTooltip = "";
    let undefinedDescription = String(ctx.undefinedEntriesInCurrentFile.length);
    const undefinedContextValueList = ["undefinedEntriesInCurFile"];
    if (ctx.undefinedEntriesInCurrentFile.length > 0) {
      undefinedContextValueList.push("IGNORE_UNDEFINED");
      const fixableNum = ctx.undefinedEntriesInCurrentFile.filter(item => {
        if (
          ctx.validateLanguageBeforeTranslate &&
          !validateLang(item.nameInfo.text, ctx.publicCtx.referredLang) &&
          ctx.unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.ignore
        ) {
          return false;
        }
        if (ctx.ignorePossibleVariables && isEnglishVariable(item.nameInfo.text)) return false;
        return true;
      }).length;
      undefinedDescription = `${ctx.undefinedEntriesInCurrentFile.length}(${fixableNum})`;
      undefinedTooltip = t(`tree.undefinedInfo.tooltip`, ctx.undefinedEntriesInCurrentFile.length, fixableNum);
      if (fixableNum > 0) {
        undefinedContextValueList.push("GEN_KEY");
      }
    }
    return [
      {
        label: t("tree.currentFile.defined"),
        description: String(ctx.definedEntriesInCurrentFile.length),
        collapsibleState: vscode.TreeItemCollapsibleState[ctx.definedEntriesInCurrentFile.length === 0 ? "None" : "Collapsed"],
        contextValue: definedContextValueList.join(","),
        level: 1,
        type: "defined",
        id: ctx.genId(element, "defined"),
        root: element.root
      },
      {
        label: t("tree.currentFile.undefined"),
        contextValue: undefinedContextValueList.join(","),
        data: ctx.undefinedEntriesInCurrentFile.map(item => item.nameInfo.text),
        meta: { file: vscode.window.activeTextEditor?.document.uri.fsPath ?? "" },
        tooltip: undefinedTooltip,
        description: undefinedDescription,
        collapsibleState: vscode.TreeItemCollapsibleState[ctx.undefinedEntriesInCurrentFile.length === 0 ? "None" : "Collapsed"],
        level: 1,
        type: "undefined",
        id: ctx.genId(element, "undefined"),
        root: element.root
      }
    ];
  }

  if (element.level === 1) {
    const entries = element.type === "defined" ? ctx.definedEntriesInCurrentFile : ctx.undefinedEntriesInCurrentFile;
    return entries.map(entry => {
      const key = getValueByAmbiguousEntryName(ctx.langInfo.tree, entry.nameInfo.name) ?? entry.nameInfo.name;
      const entryInfo = ctx.langInfo.dictionary[key]?.value ?? {};
      const contextValueList = ["COPY_NAME"];
      let description = "";
      if (element.type === "defined") {
        contextValueList.push("definedEntryInCurFile", "COPY_ENTRIES", "REWRITE_ENTRY");
        description = entryInfo[ctx.displayLang] ?? "";
      } else {
        contextValueList.push("undefinedEntryInCurFile", "IGNORE_UNDEFINED");
        if (ctx.autoTranslateMissingKey) {
          if (ctx.ignorePossibleVariables && isEnglishVariable(entry.nameInfo.text)) {
            description = t("tree.usedInfo.undefinedPossibleVariable");
          } else if (ctx.validateLanguageBeforeTranslate && !validateLang(entry.nameInfo.text, ctx.publicCtx.referredLang)) {
            description = t("tree.usedInfo.undefinedNoSourceLang");
            if (ctx.unmatchedLanguageAction !== UNMATCHED_LANGUAGE_ACTION.ignore) {
              contextValueList.push("GEN_KEY");
            }
          } else {
            contextValueList.push("GEN_KEY");
          }
        }
      }
      return {
        name: entry.nameInfo.name,
        key,
        label: internalToDisplayName(entry.nameInfo.text),
        description,
        collapsibleState: vscode.TreeItemCollapsibleState[element.type === "defined" ? "Collapsed" : "None"],
        level: 2,
        data: [entry.nameInfo.text],
        meta: { file: vscode.window.activeTextEditor?.document.uri.fsPath ?? "" },
        contextValue: contextValueList.join(","),
        usedInfo: (element.type === "defined" ? ctx.langInfo.used : ctx.langInfo.undefined)?.[
          element.type === "defined" ? entry.nameInfo.name : entry.nameInfo.text
        ],
        id: ctx.genId(element, entry.nameInfo.name || ""),
        root: element.root
      };
    });
  }

  if (element.level === 2) {
    const key = element.key as string;
    const entryInfo = ctx.langInfo.dictionary[key].value;
    return ctx.langInfo.langList
      .filter(lang => !ctx.publicCtx.ignoredLangs.includes(lang))
      .map(lang => {
        const contextValueList = ["entryTranslationInCurFile", "EDIT_VALUE", "REWRITE_ENTRY", "COPY_ENTRIES"];
        if (entryInfo[lang]) {
          contextValueList.push("COPY_VALUE");
        } else if (entryInfo[ctx.publicCtx.referredLang]) {
          contextValueList.push("FILL_VALUE");
        }
        if (entryInfo[lang] !== undefined) {
          contextValueList.push("GO_TO_DEFINITION");
        }
        if (!getLangText(lang)) {
          contextValueList.push("UNKNOWN_LANG");
        }
        return {
          label: lang,
          name: element.name as string,
          description: entryInfo[lang] ?? false,
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          level: 3,
          key: key,
          data: [key],
          meta: { lang },
          contextValue: contextValueList.join(","),
          id: ctx.genId(element, lang),
          tooltip: getLangText(lang) || t("common.unknownLang")
        };
      });
  }

  return [];
}

export function getSyncInfoChildren(ctx: TreeSectionContext, element: ExtendedTreeItem): ExtendedTreeItem[] {
  if (element.level === 0) {
    return ctx.langInfo.langList.map(lang => {
      const { desc, icon, context, tooltip, data } = checkLangSyncInfo({
        lang,
        detectedLangList: ctx.detectedLangList,
        isSyncing: ctx.isSyncing,
        displayLang: ctx.displayLang,
        referredLang: ctx.publicCtx.referredLang,
        langInfo: ctx.langInfo,
        countryMap: ctx.langInfo.countryMap
      });
      return {
        level: 1,
        key: lang,
        label: lang,
        root: element.root,
        tooltip,
        data,
        meta: { lang },
        id: ctx.genId(element, lang),
        contextValue: context,
        description: desc,
        iconPath: new vscode.ThemeIcon(icon),
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
      };
    });
  }

  if (element.level === 1) {
    return getSyncInfo({
      lang: element.key as string,
      syncBasedOnReferredEntries: ctx.publicCtx.syncBasedOnReferredEntries,
      referredLang: ctx.publicCtx.referredLang,
      langInfo: ctx.langInfo,
      countryMap: ctx.langInfo.countryMap
    }).map(item => ({
      ...item,
      level: 2,
      key: element.key,
      root: element.root,
      meta: element.meta,
      id: ctx.genId(element, item.type),
      description: String(item.num),
      collapsibleState: vscode.TreeItemCollapsibleState[item.num === 0 ? "None" : item.type === "common" ? "Collapsed" : "Expanded"]
    }));
  }

  if (element.level === 2) {
    return (element.data as string[]).map(key => {
      const contextValueList = ["syncInfoItem", "EDIT_VALUE", "REWRITE_ENTRY", "COPY_ENTRIES"];
      if (element.type !== "lack") {
        contextValueList.push("GO_TO_DEFINITION");
      }
      const tooltip = new vscode.MarkdownString();
      const definedInfo = ctx.langInfo.dictionary[key].value;
      if (element.type === "lack" || element.type === "null") {
        Object.entries(definedInfo).forEach(([lang, value]) => {
          const args = encodeURIComponent(JSON.stringify({ description: value }));
          if (value) {
            if (lang === ctx.publicCtx.referredLang) {
              contextValueList.push("FILL_VALUE");
            }
            tooltip.appendMarkdown(`- **${escapeMarkdown(lang)}:** ${escapeMarkdown(value)} [📋](command:i18nMage.copyValue?${args})\n`);
          } else {
            tooltip.appendMarkdown(`- **${escapeMarkdown(lang)}:** ${t("tree.syncInfo.null")}\n`);
          }
        });
        tooltip.isTrusted = true;
      }
      const name = unescapeString(key);
      return {
        label: internalToDisplayName(name),
        description: definedInfo[element.key as string] || definedInfo[ctx.publicCtx.referredLang],
        tooltip,
        level: 3,
        name,
        key,
        data: [key],
        meta: element.meta,
        id: ctx.genId(element, key),
        contextValue: contextValueList.join(","),
        collapsibleState: vscode.TreeItemCollapsibleState.None
      };
    });
  }

  return [];
}

export async function getUsageInfoChildren(ctx: TreeSectionContext, element: ExtendedTreeItem): Promise<ExtendedTreeItem[]> {
  if (element.level === 0) {
    const usageData = getUsageData({
      usedKeySet: ctx.langInfo.usedKeySet,
      unusedKeySet: ctx.langInfo.unusedKeySet,
      undefinedEntryMap: ctx.langInfo.undefined ?? {},
      isMatch: key => ctx.matchesSearch(key)
    });
    const types = ["used", "unused", "undefined"] as const;
    return types.map(type => {
      const keys = usageData[type].keys;
      const num = keys.length;
      let description = String(num);
      let tooltip = "";
      const contextValueList = [num === 0 ? `${type}GroupHeader-None` : `${type}GroupHeader`];

      if (type === "undefined" && num > 0) {
        contextValueList.push("IGNORE_UNDEFINED");
        const fixableNum = keys.filter(key => {
          if (
            ctx.validateLanguageBeforeTranslate &&
            !validateLang(key, ctx.publicCtx.referredLang) &&
            ctx.unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.ignore
          ) {
            return false;
          }
          if (ctx.ignorePossibleVariables && isEnglishVariable(key)) return false;
          return true;
        }).length;
        description = `${num}(${fixableNum})`;
        tooltip = t(`tree.undefinedInfo.tooltip`, num, fixableNum);
        if (fixableNum > 0) {
          contextValueList.push("GEN_KEY");
        }
      }

      return {
        type,
        label: t(`tree.usedInfo.${type}`),
        level: 1,
        root: element.root,
        description,
        id: ctx.genId(element, type),
        data: keys,
        tooltip,
        contextValue: contextValueList.join(","),
        collapsibleState: vscode.TreeItemCollapsibleState[num === 0 ? "None" : "Collapsed"]
      };
    });
  }

  if (element.level === 1) {
    const keys = element.data || [];
    return keys.map(key =>
      createUsageTreeItem({
        key,
        type: element.type!,
        root: element.root!,
        element,
        displayLang: ctx.displayLang,
        referredLang: ctx.publicCtx.referredLang,
        autoTranslateMissingKey: ctx.autoTranslateMissingKey,
        ignorePossibleVariables: ctx.ignorePossibleVariables,
        validateLanguageBeforeTranslate: ctx.validateLanguageBeforeTranslate,
        unmatchedLanguageAction: ctx.unmatchedLanguageAction,
        dictionary: ctx.langInfo.dictionary,
        usedEntryMap: ctx.langInfo.used ?? {},
        undefinedEntryMap: ctx.langInfo.undefined ?? {},
        genId: (targetElement, name) => ctx.genId(targetElement, name)
      })
    );
  }

  if (element.level === 2) {
    const usedMap = ctx.langInfo.used ?? {};
    const undefinedMap = ctx.langInfo.undefined ?? {};
    const entryUsedInfo = element.type === "used" ? usedMap[element.name as string] : undefinedMap[element.key as string];
    if (Object.keys(entryUsedInfo).length > 0) {
      const list: vscode.TreeItem[] = [];
      for (const filePath in entryUsedInfo) {
        const fileUri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(fileUri);
        entryUsedInfo[filePath].forEach(offset => {
          const [startPos, endPos] = offset.split(",").map(pos => document.positionAt(+pos));
          const range = new vscode.Range(startPos, endPos);
          list.push(new FileItem(fileUri, range));
        });
      }
      return list;
    }
    return [];
  }

  return [];
}

export function getDictionaryChildren(ctx: TreeSectionContext, element: ExtendedTreeItem): ExtendedTreeItem[] {
  const dictionaryTree = ctx.isSearching
    ? getFilteredDictionaryTreeNode(ctx.langInfo.tree, key => ctx.matchesSearch(key))
    : ctx.langInfo.tree;
  if (dictionaryTree === null) return [];

  const res = (element.stack || []).reduce((acc, item) => (acc as EntryTree)[item] as EntryTree, dictionaryTree);
  if (typeof res === "string") {
    return Object.entries(ctx.langInfo.dictionary[res].value).map(item => {
      const contextValueList = ["dictionaryItem", "GO_TO_DEFINITION", "EDIT_VALUE", "REWRITE_ENTRY"];
      if (item[1]) {
        contextValueList.push("COPY_VALUE", "COPY_ENTRIES");
      }
      return {
        label: internalToDisplayName(item[0]),
        description: item[1],
        tooltip: getLangText(item[0]) || t("common.unknownLang"),
        id: ctx.genId(element, item[0]),
        contextValue: contextValueList.join(","),
        name: unescapeString(res),
        key: res,
        value: item[1],
        meta: { lang: item[0] },
        collapsibleState: vscode.TreeItemCollapsibleState.None
      };
    });
  }

  return Object.entries(res)
    .sort((a, b) => {
      if (typeof a[1] !== typeof b[1]) {
        return typeof a[1] === "string" ? 1 : -1;
      }
      return a[0] > b[0] ? 1 : -1;
    })
    .map(item => {
      const stack = (element.stack || []).concat(item[0]);
      const key = typeof item[1] === "string" ? item[1] : undefined;
      const contextValueList = ["COPY_ENTRIES"];
      if (key !== undefined) {
        contextValueList.push("COPY_NAME");
      }
      return {
        label: internalToDisplayName(item[0]),
        description: key !== undefined ? ctx.langInfo.dictionary[key].value[ctx.displayLang] : false,
        root: element.root,
        id: ctx.genId(element, item[0]),
        contextValue: contextValueList.join(","),
        name: key !== undefined ? unescapeString(key) : undefined,
        key,
        stack,
        tooltip: stack.join("."),
        iconPath: new vscode.ThemeIcon(key !== undefined ? "key" : "folder"),
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
      };
    });
}
