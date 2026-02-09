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
  I18nFramework,
  NamespaceStrategy,
  EntryClassTree,
  DirNode,
  FixQuery,
  KeyGenerationFillScope,
  KeyStrategy,
  IndentType,
  I18nUpdatePayload,
  InvalidKeyStrategy,
  LanguageStructure,
  ModifyQuery,
  QuoteStyle4Key,
  QuoteStyle4Value,
  ExcelImportMode
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
  modifyQuery: ModifyQuery | null;
  matchExistingKey: boolean;
  autoTranslateEmptyKey: boolean;
  keyGenerationFillScope: KeyGenerationFillScope;
  keyStyle: KeyStyle;
  keyStrategy: KeyStrategy;
  stopWords: string[];
  stopPrefixes: string[];
  maxKeyLength: number;
  keyPrefix: string;
  indentType: IndentType;
  indentSize: number;
  quoteStyleForKey: QuoteStyle4Key;
  quoteStyleForValue: QuoteStyle4Value;
  scanStringLiterals: boolean;
  missingEntryFile: string;
  missingEntryPath: string;
  fixQuery: FixQuery;
  invalidKeyStrategy: InvalidKeyStrategy;
  languageStructure: LanguageStructure;
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
  usedLiteralKeySet: Set<string>;
  unusedKeySet: Set<string>;
  avgFileNestedLevel: number; // 0: 单文件模式，>0: 多文件模式
  langFileExtraInfo: Record<string, FileExtraInfo>;
  isVacant: boolean;
  entryTree: EntryTree;
  updatePayloads: I18nUpdatePayload[];
  patchedEntryIdInfo: Record<string, FixedTEntry[]>;
  importExcelFrom: string;
  importSheetData: string;
  exportExcelTo: string;
  trimKeyList: string[];
  nameSeparator: string;
  importMode: ExcelImportMode;
  baselineLanguage: string;
}
