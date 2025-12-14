import {
  FixQuery,
  I18nFramework,
  IndentType,
  InvalidKeyStrategy,
  KeyGenerationFillScope,
  KeyStrategy,
  KeyStyle,
  LanguageStructure,
  ModifyQuery,
  NamespaceStrategy,
  QuoteStyle4Key,
  QuoteStyle4Value,
  SortMode
} from "@/types";

export interface LangMageOptions {
  task?: string;
  langPath?: string;
  projectPath?: string;
  i18nFramework?: I18nFramework;
  namespaceStrategy?: NamespaceStrategy;
  ignoredLangs?: string[];
  referredLang?: string;
  defaultLang?: string;
  globalFlag?: boolean;
  exportDir?: string;
  cachePath?: string;
  importExcelFrom?: string;
  exportExcelTo?: string;
  syncBasedOnReferredEntries?: boolean;
  sortAfterFix?: boolean;
  sortingWriteMode?: SortMode;
  sortingExportMode?: SortMode;
  modifyQuery?: ModifyQuery | null;
  trimKeyList?: string[];
  manuallyMarkedUsedEntries?: string[];
  ignoredUndefinedEntries?: string[];
  matchExistingKey?: boolean;
  autoTranslateEmptyKey?: boolean;
  keyGenerationFillScope?: KeyGenerationFillScope;
  keyStyle?: KeyStyle;
  keyStrategy?: KeyStrategy;
  stopWords?: string[];
  stopPrefixes?: string[];
  maxKeyLength?: number;
  keyPrefix?: string;
  indentType?: IndentType;
  indentSize?: number;
  quoteStyleForKey?: QuoteStyle4Key;
  quoteStyleForValue?: QuoteStyle4Value;
  scanStringLiterals?: boolean;
  missingEntryFile?: string;
  missingEntryPath?: string;
  fixQuery?: FixQuery;
  invalidKeyStrategy?: InvalidKeyStrategy;
  languageStructure?: LanguageStructure;
}

export const EXECUTION_RESULT_CODE = {
  NoLackEntries: 104,
  NoTrimEntries: 105,
  NoSortingApplied: 106,
  Success: 200,
  Processing: 301,
  Cancelled: 302,
  NoLangPathDetected: 303,
  ImportNoKey: 304,
  ImportNoLang: 305,
  TranslatorPartialFailed: 306,
  NoReferredLang: 307,
  UnknownError: 400,
  UnknownCheckError: 401,
  UnknownFixError: 402,
  UnknownRewriteError: 403,
  UnknownExportError: 404,
  UnknownImportError: 405,
  UnknownModifyError: 406,
  TranslatorFailed: 407,
  InvalidExportPath: 420,
  InvalidEntryName: 421
};

export type ExecutionResultCode = (typeof EXECUTION_RESULT_CODE)[keyof typeof EXECUTION_RESULT_CODE];

export interface ExecutionResult {
  success: boolean;
  message: string;
  code: ExecutionResultCode;
  defaultSuccessMessage?: string;
  defaultErrorMessage?: string;
}

export interface FixExecutionResult extends ExecutionResult {
  data?: {
    success: number;
    failed: number;
    // skipped: number;
    // translated: number;
    // filled: number;
    patched: number;
    generated: number;
    total: number;
  };
}
