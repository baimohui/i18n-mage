import { Credentials } from "@/translator/index";

export interface LangMageOptions {
  task?: string;
  langDir?: string;
  rootPath?: string;
  checkUnityFlag?: boolean;
  checkRepeatFlag?: boolean;
  checkStyleFlag?: boolean;
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
  sortWithTrim?: boolean;
  showPreInfo?: boolean;
  importExcelFrom?: string;
  exportExcelTo?: string;
  clearCache?: boolean;
  credentials?: Credentials;
  syncBasedOnReferredEntries?: boolean;
  modifyList?: Array<{ key: string; name: string; value: string; lang: string }>;
  trimKeyList?: string[];
}
