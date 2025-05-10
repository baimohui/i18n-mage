export type LangName = string;
export type EntryValue = string;
export type UnescapedEntryKey = string;
export type EscapedEntryKey = string;

export interface LangFileInfo {
  formatType: string;
  indents: string;
  content: EntryMap;
  raw: EntryTree;
  prefix: string;
  suffix: string;
  innerVar: string;
  keyQuotes: boolean;
}

export interface EntryTree {
  [key: UnescapedEntryKey]: string | EntryTree;
}

export interface LangTree {
  [key: LangName]: EntryTree;
}

export type EntryMap = Record<EscapedEntryKey, EntryValue>;

export type LangCountryMap = Record<LangName, EntryMap>;

export type LangDictionary = Record<EscapedEntryKey, Record<LangName, EntryValue>>;

export interface TEntry {
  raw: string;
  text: string;
  regex: RegExp;
  id: string;
  class: string;
  name: string;
  pos: number;
  path?: string;
  isValid?: boolean;
  fixedRaw?: string;
  var?: Record<string, string>;
}

export interface PEntry {
  name: string;
  pos: number;
}

// export type CaseType = "upper" | "lower" | "title" | "sentence" | "camel" | "pascal" | "snake" | "kebab" | "screaming-snake" | "screaming-kebab";
export type CaseType = "wc" | "au" | "cc" | "pc" | "unknown";

export type EntryClassInfo = Record<
  string,
  {
    num: number;
    layer: number[];
    case: CaseType;
    childrenCase: Record<CaseType, number> | {};
  }
>;

export type LackInfo = Record<LangName, EscapedEntryKey[]>;
export type NullInfo = Record<LangName, EscapedEntryKey[]>;

type Cell = string | number | boolean | Date | null | undefined;

export type ExcelData = {
  name: string; // 工作表名称
  data: Cell[][]; // 工作表数据，二维数组形式
}[];

export type ApiPlatform = "google" | "baidu" | "tencent";

export interface TranslateParams {
  source: string;
  target: string;
  sourceTextList: string[];
  apiId: string;
  apiKey: string;
}

export interface TranslateResult {
  success: boolean;
  langUnsupported?: boolean;
  data?: string[];
  message?: string;
  api?: ApiPlatform;
}
