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
  FileExtraInfo,
  SortMode,
  KeyStyle,
  QuoteStyle,
  I18nFramework
} from "@/types";

// 外部模块可访问的公共上下文
export interface LangContextPublic {
  task: string;
  langPath: string;
  langFileType: string;
  projectPath: string;
  i18nFramework: I18nFramework;
  referredLang: string;
  defaultLang: string;
  ignoredLangs: string[];
  globalFlag: boolean;
  exportDir: string;
  cachePath: string;
  styleScore: number;
  fileStructure: EntryNode | null;
  syncBasedOnReferredEntries: boolean;
  sortingWriteMode: SortMode;
  sortingExportMode: SortMode;
  manuallyMarkedUsedEntries: string[];
  modifyList: Array<{ key: string; name: string; value: string; lang: string }>;
  matchExistingKey: boolean;
  autoTranslateMissingKey: boolean;
  autoTranslateEmptyKey: boolean;
  validateLanguageBeforeTranslate: boolean;
  generatedKeyStyle: KeyStyle;
  stopWords: string[];
  maxGeneratedKeyLength: number;
  keyPrefix: string;
  languageFileIndent: number;
  quoteStyleForKey: "auto" | QuoteStyle;
  quoteStyleForValue: "auto" | QuoteStyle;
  scanStringLiterals: boolean;
  defaultFilePos: string;
}

// 内部模块才能访问的完整上下文
export interface LangContextInternal extends LangContextPublic {
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
  multiFileMode: number; // 0: 单文件模式，>0: 多文件模式
  nestedLocale: number; // 嵌套的语言级别
  langFileExtraInfo: Record<string, FileExtraInfo>;
  isVacant: boolean;
  entryTree: EntryTree;
  updatedEntryValueInfo: Record<string, Record<string, string | undefined>>;
  patchedEntryIdInfo: Record<string, FixedTEntry[]>;
  importExcelFrom: string;
  importSheetData: string;
  exportExcelTo: string;
  trimKeyList: string[];
  nameSeparator: string;
}
