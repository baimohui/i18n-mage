import * as vscode from "vscode";
import { ExtendedTreeItem } from "./models";
import { t } from "@/utils/i18n";
import { UNMATCHED_LANGUAGE_ACTION, UnmatchedLanguageAction } from "@/types";
import { internalToDisplayName, isEnglishVariable, unescapeString, validateLang } from "@/utils/regex";

export interface UsageData {
  used: { keys: string[] };
  unused: { keys: string[] };
  undefined: { keys: string[] };
}

interface GetUsageDataParams {
  usedKeySet: Set<string>;
  unusedKeySet: Set<string>;
  undefinedEntryMap: Record<string, Record<string, Set<string>>>;
  isMatch: (key: string) => boolean;
}

export function getUsageData(params: GetUsageDataParams): UsageData {
  const { usedKeySet, unusedKeySet, undefinedEntryMap, isMatch } = params;
  const types = ["used", "unused", "undefined"] as const;
  const data: UsageData = { used: { keys: [] }, unused: { keys: [] }, undefined: { keys: [] } };

  for (const type of types) {
    let keys: string[] = [];
    if (type === "undefined") {
      keys = Object.keys(undefinedEntryMap);
    } else {
      keys = Array.from(type === "used" ? usedKeySet : unusedKeySet);
    }
    data[type].keys = keys.filter(key => isMatch(key));
  }

  return data;
}

interface CreateUsageTreeItemParams {
  key: string;
  type: string;
  root: string;
  element: ExtendedTreeItem;
  displayLang: string;
  referredLang: string;
  autoTranslateMissingKey: boolean;
  ignorePossibleVariables: boolean;
  validateLanguageBeforeTranslate: boolean;
  unmatchedLanguageAction: UnmatchedLanguageAction;
  dictionary: Record<string, { value: Record<string, string> }>;
  usedEntryMap: Record<string, Record<string, Set<string>>>;
  undefinedEntryMap: Record<string, Record<string, Set<string>>>;
  genId: (element: ExtendedTreeItem, name: string) => string;
}

export function createUsageTreeItem(params: CreateUsageTreeItemParams): ExtendedTreeItem {
  const {
    key,
    type,
    root,
    element,
    displayLang,
    referredLang,
    autoTranslateMissingKey,
    ignorePossibleVariables,
    validateLanguageBeforeTranslate,
    unmatchedLanguageAction,
    dictionary,
    usedEntryMap,
    undefinedEntryMap,
    genId
  } = params;
  const name = unescapeString(key);
  const contextValueList: string[] = [];
  let description = "";
  let collapsibleState = vscode.TreeItemCollapsibleState.None;

  if (type === "undefined") {
    contextValueList.push("undefinedEntry", "IGNORE_UNDEFINED");
    const usedNum = Object.values(undefinedEntryMap[key]).reduce((acc, cur) => acc + cur.size, 0);
    const descriptions = [`<${usedNum}>`];

    if (autoTranslateMissingKey) {
      if (ignorePossibleVariables && isEnglishVariable(key)) {
        descriptions.push(t("tree.usedInfo.undefinedPossibleVariable"));
      } else if (validateLanguageBeforeTranslate && !validateLang(key, referredLang)) {
        descriptions.push(t("tree.usedInfo.undefinedNoSourceLang"));
        if (unmatchedLanguageAction !== UNMATCHED_LANGUAGE_ACTION.ignore) {
          contextValueList.push("GEN_KEY");
        }
      } else {
        contextValueList.push("GEN_KEY");
      }
    }

    description = descriptions.join(" ");
    return {
      key,
      label: key,
      level: 2,
      data: [key],
      contextValue: contextValueList.join(","),
      description,
      type,
      root,
      id: genId(element, key),
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
    };
  }

  if (type === "used") {
    const usedNum = Object.values(usedEntryMap[name]).reduce((acc, cur) => acc + cur.size, 0);
    const entryInfo = dictionary[key];
    description = `<${usedNum || "?"}>${entryInfo.value[displayLang]}`;
    contextValueList.push(usedNum === 0 ? "usedGroupItem-None" : "usedGroupItem", "COPY_ENTRIES");
    collapsibleState = usedNum === 0 ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;

    return {
      key,
      name,
      label: internalToDisplayName(name),
      description,
      level: 2,
      contextValue: contextValueList.join(","),
      type,
      root,
      id: genId(element, key),
      collapsibleState
    };
  }

  const entryInfo = dictionary[key];
  contextValueList.push("unusedGroupItem", "COPY_NAME", "COPY_ENTRIES");
  description = entryInfo.value[displayLang];

  return {
    label: internalToDisplayName(name),
    description,
    level: 2,
    root,
    key,
    data: [key],
    contextValue: contextValueList.join(","),
    id: genId(element, key),
    collapsibleState: vscode.TreeItemCollapsibleState.None
  };
}
