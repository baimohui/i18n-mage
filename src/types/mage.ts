import { I18nFramework, KeyStyle, SortMode } from "@/types";

export interface LangMageOptions {
  task?: string;
  langPath?: string;
  projectPath?: string;
  excludedLangList?: string[];
  includedLangList?: string[];
  ignoredFileList?: string[];
  referredLang?: string;
  displayLang?: string;
  defaultLang?: string;
  globalFlag?: boolean;
  rewriteFlag?: boolean;
  exportDir?: string;
  cachePath?: string;
  ignoreEmptyLangFile?: boolean;
  langFileMinLength?: number;
  showPreInfo?: boolean;
  importExcelFrom?: string;
  exportExcelTo?: string;
  clearCache?: boolean;
  syncBasedOnReferredEntries?: boolean;
  sortingWriteMode?: SortMode;
  sortingExportMode?: SortMode;
  defaultNamespace?: string;
  tFuncNames?: string[];
  interpolationBrackets?: "auto" | "single" | "double";
  namespaceSeparator?: "auto" | ":" | ".";
  modifyList?: Array<{ key: string; name: string; value: string; lang: string }>;
  trimKeyList?: string[];
  manuallyMarkedUsedEntries?: string[];
  i18nFramework?: I18nFramework;
  matchExistingKey?: boolean;
  autoTranslateMissingKey?: boolean;
  generatedKeyStyle?: KeyStyle;
  stopWords?: string[];
  maxGeneratedKeyLength?: number;
  keyPrefix?: string;
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
  TranslatorFailed: 306,
  NoReferredLang: 307,
  UnknownError: 400,
  UnknownCheckError: 401,
  UnknownFixError: 402,
  UnknownRewriteError: 403,
  UnknownExportError: 404,
  UnknownImportError: 405,
  UnknownModifyError: 406,
  InvalidExportPath: 420,
  InvalidEntryName: 421
};

export type ExecutionResultCode = (typeof EXECUTION_RESULT_CODE)[keyof typeof EXECUTION_RESULT_CODE];

export interface ExecutionResult {
  success: boolean;
  message: string;
  code: ExecutionResultCode;
}

export interface I18nFeaturesInfo {
  framework: I18nFramework;
  defaultNamespace: string;
  tFuncNames: string[];
  interpolationBrackets: "auto" | "single" | "double";
  namespaceSeparator: "auto" | ":" | ".";
}
