import { I18nFramework, KeyStyle, NamespaceStrategy, QuoteStyle, SortMode } from "@/types";

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
  modifyList?: Array<{ key: string; name: string; value: string; lang: string }>;
  trimKeyList?: string[];
  manuallyMarkedUsedEntries?: string[];
  ignoredUndefinedEntries?: string[];
  matchExistingKey?: boolean;
  autoTranslateMissingKey?: boolean;
  autoTranslateEmptyKey?: boolean;
  validateLanguageBeforeTranslate?: boolean;
  generatedKeyStyle?: KeyStyle;
  stopWords?: string[];
  maxGeneratedKeyLength?: number;
  keyPrefix?: string;
  languageFileIndent?: number;
  quoteStyleForKey?: "auto" | QuoteStyle;
  quoteStyleForValue?: "auto" | QuoteStyle;
  scanStringLiterals?: boolean;
  missingEntryFile?: string;
  missingEntryPath?: string;
  fileToProcess?: string;
}

export const EXECUTION_RESULT_CODE = {
  NoLackEntries: 104,
  NoTrimEntries: 105,
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
