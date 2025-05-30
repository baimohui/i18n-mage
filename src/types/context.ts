import {
  EntryTree,
  LangDictionary,
  LangCountryMap,
  EntryClassInfo,
  TEntry,
  LackInfo,
  NullInfo,
  EntryNode,
  FileExtraInfo
} from "@/types";
import { Credentials } from "@/translator/index";

// 外部模块可访问的公共上下文
export interface LangContextPublic {
  task: string;
  langDir: string;
  langFileType: string;
  rootPath: string;
  referredLang: string;
  checkUnityFlag: boolean;
  checkRepeatFlag: boolean;
  checkStyleFlag: boolean;
  excludedLangList: string[];
  includedLangList: string[];
  globalFlag: boolean;
  rewriteFlag: boolean;
  exportDir: string;
  cachePath: string;
  ignoreEmptyLangFile: boolean;
  langFileMinLength: number;
  sortWithTrim: boolean;
  showPreInfo: boolean;
  styleScore: number;
  fileStructure: EntryNode | null;
  syncBasedOnReferredEntries: boolean;
  modifyList: Array<{ key: string; name: string; value: string; lang: string }>;
}

// 内部模块才能访问的完整上下文
export interface LangContextInternal extends LangContextPublic {
  langFormatType: string;
  langDictionary: LangDictionary;
  langCountryMap: LangCountryMap;
  lackInfo: LackInfo;
  extraInfo: Record<string, string[]>;
  nullInfo: NullInfo;
  referredEntryList: string[];
  singleLangRepeatTextInfo: Record<string, Record<string, string[]>>;
  multiLangRepeatTextInfo: Record<string, string[]>;
  entryClassTree: Record<string, any>;
  entryClassInfo: EntryClassInfo;
  undefinedEntryList: TEntry[];
  undefinedEntryMap: Record<string, Record<string, number[]>>;
  usedEntryMap: Record<string, Record<string, number[]>>;
  langFileExtraInfo: Record<string, FileExtraInfo>;
  primaryPathLevel: number;
  roguePath: string;
  isVacant: boolean;
  entryTree: EntryTree;
  updatedEntryValueInfo: Record<string, Record<string, string | undefined>>;
  patchedEntryIdInfo: Record<string, TEntry[]>;
  importExcelFrom: string;
  importSheetData: string;
  exportExcelTo: string;
  clearCache: boolean;
  credentials: Credentials | null;
  trimKeyList: string[];
  ignoredFileList: string[];
}