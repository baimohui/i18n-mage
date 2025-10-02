import {
  EntryTree,
  LangDictionary,
  LangCountryMap,
  TEntry,
  FixedTEntry,
  LackInfo,
  NullInfo,
  FileExtraInfo,
  SortMode,
  KeyStyle,
  QuoteStyle,
  I18nFramework,
  NamespaceStrategy,
  EntryClassTree,
  DirNode
} from "@/types";

// 外部模块可访问的公共上下文
export interface LangContextPublic {
  task: string;
  langPath: string;
  langFileType: string;
  projectPath: string;
  i18nFramework: I18nFramework;
  namespaceStrategy: NamespaceStrategy;
  referredLang: string;
  defaultLang: string;
  ignoredLangs: string[];
  globalFlag: boolean;
  exportDir: string;
  cachePath: string;
  styleScore: number;
  fileStructure: DirNode | null;
  syncBasedOnReferredEntries: boolean;
  sortAfterFix: boolean;
  sortingWriteMode: SortMode;
  sortingExportMode: SortMode;
  manuallyMarkedUsedEntries: string[];
  ignoredUndefinedEntries: string[];
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
  missingEntryFile: string;
  missingEntryPath: string;
  fixQuery: {
    entriesToGen: string[] | boolean;
    genScope?: string[];
    entriesToFill: string[] | boolean;
    fillScope?: string[];
  };
}

// 内部模块才能访问的完整上下文
export interface LangContextInternal extends LangContextPublic {
  langDictionary: LangDictionary;
  langCountryMap: LangCountryMap;
  lackInfo: LackInfo;
  extraInfo: Record<string, string[]>;
  nullInfo: NullInfo;
  entryClassTree: EntryClassTree;
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
