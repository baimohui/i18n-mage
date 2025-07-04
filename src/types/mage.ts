import { Credentials } from "@/translator/index";
import { I18nSolution, SortMode } from "@/types";

export interface LangMageOptions {
  task?: string;
  langPath?: string;
  projectPath?: string;
  excludedLangList?: string[];
  includedLangList?: string[];
  ignoredFileList?: string[];
  referredLang?: string;
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
  credentials?: Credentials;
  syncBasedOnReferredEntries?: boolean;
  sortingWriteMode?: SortMode;
  sortingExportMode?: SortMode;
  modifyList?: Array<{ key: string; name: string; value: string; lang: string }>;
  trimKeyList?: string[];
  manuallyMarkedUsedEntries?: string[];
  i18nSolution?: I18nSolution;
}
