import { IndentType, QuoteStyle4Key, QuoteStyle4Value } from "./config";

export type LangName = string;
export type EntryValue = string;
export type EntryKeySeg = string;
export type EntryKey = string;
export type LangFileType = "js" | "ts" | "json" | "json5" | "mjs" | "cjs";

export interface FileExtraInfo {
  indentType: IndentType;
  indentSize: number;
  prefix: string;
  suffix: string;
  innerVar: string;
  isFlat: boolean;
  keyQuotes: Omit<QuoteStyle4Key, "auto">;
  valueQuotes: Omit<QuoteStyle4Value, "auto">;
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
    boundPrefix: string;
    boundKey: string;
    vars: string[];
  };
  vars: string[];
}

export interface FixedTEntry {
  id: string;
  raw: string;
  fixedRaw: string;
  fixedKey: string;
  addedVars: string;
  pos: string;
}

export interface PEntry {
  name: string;
  value: string;
  pos: string;
}

// export type CaseType = "upper" | "lower" | "title" | "sentence" | "camel" | "pascal" | "snake" | "kebab" | "screaming-snake" | "screaming-kebab";

export type EntryClassTreeItem = {
  [key: EntryKeySeg]: null | EntryClassTreeItem;
};

export type EntryClassTree = {
  filePos: string;
  data: EntryClassTreeItem;
}[];

export type LackInfo = Record<LangName, EntryKey[]>;
export type NullInfo = Record<LangName, EntryKey[]>;

type Cell = string | number | boolean | Date | null | undefined;

export type ExcelData = {
  name: string; // 工作表名称
  data: Cell[][]; // 工作表数据，二维数组形式
}[];

// 定义节点类型
type FileNode = {
  type: "file";
  ext: string;
};

export type DirNode = {
  type: "directory";
  children: Record<string, FileNode | DirNode>;
};

export type EntryNode = FileNode | DirNode;

export interface FixQuery {
  entriesToGen: string[] | boolean;
  genScope?: string[];
  entriesToFill: string[] | boolean;
  fillScope?: string[];
  fillWithOriginal?: boolean;
}

export type ModifyQuery = EditValueQuery | RenameKeyQuery;

export interface EditValueQuery {
  type: "editValue" | "rewriteEntry";
  key: string;
  value: string;
  lang?: string;
}

export interface RenameKeyQuery {
  type: "renameKey";
  key: string;
  keyChange: {
    key: Comparison;
    filePos: Comparison;
    fullPath: Comparison;
  };
}

export interface I18nUpdatePayload {
  type: "add" | "edit" | "fill" | "delete" | "rename";
  key: string; // 原始 key（rename 时是旧 key）
  name?: string;
  valueChanges?: Record<string, Comparison>; // 各语言的变化
  keyChange?: {
    key: Comparison;
    filePos: Comparison;
    fullPath: Comparison;
  }; // key 的变化
  meta?: {
    source?: string; // 来源（例如手动、自动翻译）
    timestamp?: number; // 操作时间
  };
}

interface Comparison {
  before?: string; // 修改前（新增时无）
  after: string; // 修改后（删除时无）
}
