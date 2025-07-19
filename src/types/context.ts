import {
  EntryTree,
  LangDictionary,
  LangCountryMap,
  EntryClassInfo,
  TEntry,
  FixedTEntry,
  LackInfo,
  NullInfo,
  EntryNode,
  I18nFramework,
  FileExtraInfo,
  SortMode,
  KeyStyle,
  QuoteStyle
} from "@/types";

// 外部模块可访问的公共上下文
export interface LangContextPublic {
  task: string;
  langPath: string;
  langFileType: string;
  projectPath: string;
  referredLang: string;
  displayLang: string;
  defaultLang: string;
  excludedLangList: string[];
  includedLangList: string[];
  globalFlag: boolean;
  rewriteFlag: boolean;
  exportDir: string;
  cachePath: string;
  ignoreEmptyLangFile: boolean;
  langFileMinLength: number;
  showPreInfo: boolean;
  styleScore: number;
  fileStructure: EntryNode | null;
  syncBasedOnReferredEntries: boolean;
  sortingWriteMode: SortMode;
  sortingExportMode: SortMode;
  defaultNamespace: string;
  tFuncNames: string[];
  interpolationBrackets: "auto" | "single" | "double";
  namespaceSeparator: "auto" | ":" | ".";
  manuallyMarkedUsedEntries: string[];
  modifyList: Array<{ key: string; name: string; value: string; lang: string }>;
  i18nFramework: I18nFramework;
  matchExistingKey: boolean;
  autoTranslateMissingKey: boolean;
  generatedKeyStyle: KeyStyle;
  stopWords: string[];
  maxGeneratedKeyLength: number;
  keyPrefix: string;
  languageFileIndent: number;
  quoteStyleForKey: "auto" | QuoteStyle;
  quoteStyleForValue: "auto" | QuoteStyle;
}

// 内部模块才能访问的完整上下文
export interface LangContextInternal extends LangContextPublic {
  langFormatType: string;
  langDictionary: LangDictionary;
  langCountryMap: LangCountryMap;
  lackInfo: LackInfo;
  extraInfo: Record<string, string[]>;
  nullInfo: NullInfo;
  singleLangRepeatTextInfo: Record<string, Record<string, string[]>>;
  multiLangRepeatTextInfo: Record<string, string[]>;
  entryClassTree: Record<string, any>;
  entryClassInfo: EntryClassInfo;
  undefinedEntryList: TEntry[];
  undefinedEntryMap: Record<string, Record<string, Set<string>>>;
  usedEntryMap: Record<string, Record<string, Set<string>>>;
  usedKeySet: Set<string>;
  unusedKeySet: Set<string>;
  isFlat: boolean;
  langFileExtraInfo: Record<string, FileExtraInfo>;
  isVacant: boolean;
  entryTree: EntryTree;
  updatedEntryValueInfo: Record<string, Record<string, string | undefined>>;
  patchedEntryIdInfo: Record<string, FixedTEntry[]>;
  importExcelFrom: string;
  importSheetData: string;
  exportExcelTo: string;
  clearCache: boolean;
  trimKeyList: string[];
  ignoredFileList: string[];
}
