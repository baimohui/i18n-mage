export type LangName = string;
export type EntryValue = string;
export type EntryKeySeg = string;
export type EntryKey = string;
export type LangFileType = "js" | "ts" | "json" | "json5" | "mjs" | "cjs";

export interface FileExtraInfo {
  indentSize: number;
  nestedLevel: number;
  prefix: string;
  suffix: string;
  innerVar: string;
  keyQuotes: QuoteStyle;
  valueQuotes: QuoteStyle;
}
export interface LangFileInfo {
  data: EntryTree;
  extraInfo: FileExtraInfo;
}

export interface LangFilesData {
  fileType: LangFileType;
  fileExtraInfo: Record<LangName, FileExtraInfo>;
  langTree: LangTree;
}

export interface EntryTree {
  [key: EntryKeySeg]: string | string[] | EntryTree;
}

export interface LangTree {
  [key: LangName]: EntryTree;
}

export type EntryMap = Record<EntryKey, EntryValue>;

export type LangCountryMap = Record<LangName, EntryMap>;

export interface LangDictionary {
  [key: EntryKey]: {
    fullPath: string;
    fileScope: string;
    value: Record<LangName, EntryValue>;
  };
}

export type TEntryPartType = "" | "text" | "varText" | "var" | "obj" | "arr" | "logic";

export interface TEntry {
  raw: string;
  pos: string;
  path?: string;
  nameInfo: {
    text: string;
    regex: RegExp;
    name: string;
    boundClass: string;
    boundName: string;
    vars: string[];
  };
  vars: string[];
}

export interface FixedTEntry {
  id: string;
  raw: string;
  fixedRaw: string;
}

export interface PEntry {
  name: string;
  value: string;
  pos: string;
}

// export type CaseType = "upper" | "lower" | "title" | "sentence" | "camel" | "pascal" | "snake" | "kebab" | "screaming-snake" | "screaming-kebab";
export type CaseType = "wc" | "au" | "cc" | "pc" | "unknown";

export type EntryClassInfo = Record<
  string,
  {
    num: number;
    layer: number[];
    case: CaseType;
    childrenCase: Record<CaseType, number> | object;
  }
>;

export type LackInfo = Record<LangName, EntryKey[]>;
export type NullInfo = Record<LangName, EntryKey[]>;

type Cell = string | number | boolean | Date | null | undefined;

export type ExcelData = {
  name: string; // 工作表名称
  data: Cell[][]; // 工作表数据，二维数组形式
}[];

// 定义节点类型
export interface EntryNode {
  type: "directory" | "file";
  children?: Record<string, EntryNode>; // 只有目录有 children
  ext?: string; // 只有文件有扩展名
}

export type QuoteStyle = "single" | "double" | "none";
