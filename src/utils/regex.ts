import fs from "fs";
import path from "path";
import JSON5 from "json5";
import * as vscode from "vscode";
import { LANG_FORMAT_TYPE, LANG_ENTRY_SPLIT_SYMBOL, getLangCode } from "./const";
import { LangFileInfo, EntryMap, EntryTree, TEntry, PEntry, CaseType, LangTree, EntryNode, FileExtraInfo } from "../types/common";

export function isIgnoredDir(dir: string): boolean {
  const ignoredDirRegex = /^(dist|node_modules|img|image|css|asset|\.)/i;
  return ignoredDirRegex.test(dir);
}

/**
 * 获取当前编辑器最准确的换行符
 * 判断优先级：1. 当前文档实际使用的换行符 > 2. 用户配置的换行符 > 3. 系统默认换行符
 * @returns '\n' (LF) 或 '\r\n' (CRLF)
 */
export function getLineEnding(): string {
  const activeDocEol = getActiveDocumentEol();
  if (activeDocEol !== null && activeDocEol !== undefined) {
    return activeDocEol;
  }
  const configuredEol = getConfiguredLineEnding();
  if (configuredEol !== null && configuredEol !== undefined) {
    return configuredEol;
  }
  return getSystemDefaultEol();
}

/**
 * 获取活动文档实际使用的换行符
 */
function getActiveDocumentEol(): string | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }
  // 方式 A：通过 document.eol 属性
  if (editor.document.eol === vscode.EndOfLine.CRLF) {
    return "\r\n";
  } else if (editor.document.eol === vscode.EndOfLine.LF) {
    return "\n";
  }
  // 方式 B：通过内容检测（更可靠，特别是新建文件时）
  const text = editor.document.getText();
  const hasCRLF = text.indexOf("\r\n") !== -1;
  const hasLF = text.indexOf("\n") !== -1;
  // 如果同时存在两种换行符，优先返回出现次数多的
  if (hasCRLF && hasLF) {
    const crlfCount = (text.match(/\r\n/g) || []).length;
    const lfCount = (text.match(/[^\r]\n/g) || []).length;
    return crlfCount > lfCount ? "\r\n" : "\n";
  }
  if (hasCRLF) return "\r\n";
  if (hasLF) return "\n";
  return null;
}

/**
 * 获取用户配置的换行符
 */
function getConfiguredLineEnding(): string | null {
  const config = vscode.workspace.getConfiguration("files");
  const eolSetting = config.get<string>("eol");
  if (eolSetting === "\r\n") {
    return "\r\n";
  } else if (eolSetting === "\n") {
    return "\n";
  }
  return null; // 设置为 auto 或未设置
}

/**
 * 获取系统默认换行符
 */
function getSystemDefaultEol(): string {
  return process.platform === "win32" ? "\r\n" : "\n";
}

export function getCaseType(str: string): CaseType {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(str)) return "wc"; // weird-case
  if (str === str.toUpperCase()) return "au"; // Uppercase
  if (/^[a-z][A-Za-z0-9]*$/.test(str)) return "cc"; // camelCase
  if (/^[A-Z][A-Za-z0-9]*$/.test(str)) return "pc"; // PascalCase
  return "unknown";
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ExtractResult {
  fileType: string; // 最终使用的文件后缀
  formatType: string; // 最终使用的格式
  langTree: LangTree; // 语言数据树
  fileExtraInfo: Record<string, FileExtraInfo>;
  fileStructure: EntryNode; // 带 type 标记的文件树
}

export function extractLangDataFromDir(langDir: string): ExtractResult | null {
  let validFileType = "";
  let validFormatType = "";
  const fileExtraInfo: Record<string, FileExtraInfo> = {};

  function traverse(
    dir: string,
    pathSegs: string[]
  ): {
    tree: LangTree;
    node: EntryNode;
    hasData: boolean;
  } {
    const tree: LangTree = {};
    const node: EntryNode = { type: "directory", children: {} };
    let hasData = false;

    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, dirent.name);

      if (dirent.isDirectory()) {
        const subPathSegs = [...pathSegs, dirent.name];
        const { tree: subTree, node: subNode, hasData: ok } = traverse(fullPath, subPathSegs);
        if (ok) {
          tree[dirent.name] = subTree;
          node.children![dirent.name] = subNode;
          hasData = true;
        }
      } else {
        const [, base, ext] = dirent.name.match(/^(.*)\.([^.]+)$/) as RegExpMatchArray;
        if (!/^(json|js|ts|json5|mjs|cjs)$/.test(ext) || (validFileType && ext !== validFileType) || base === "index") {
          // 非法或不一致的后缀、跳过
          continue;
        }

        const info = getLangFileInfo(fullPath);
        if (!info) continue;
        const { data, extraInfo, formatType } = info;

        validFileType ||= ext;
        validFormatType = formatType;

        // 挂到语言树
        tree[base] = data;
        // 在结构树中标记为文件
        node.children![base] = { type: "file", ext };
        hasData = true;
        // 生成位置键：pathSegs + base
        const locationKey = [...pathSegs, base].join(".");
        fileExtraInfo[locationKey] = extraInfo;
      }
    }
    return { tree, node, hasData };
  }

  const { tree: langTree, node: fileStructure, hasData } = traverse(langDir, []);
  if (!hasData) return null;

  return {
    fileType: validFileType,
    formatType: validFormatType,
    langTree,
    fileExtraInfo,
    fileStructure
  };
}

export function getLangFileInfo(filePath: string): LangFileInfo | null {
  try {
    let fileContent = fs.readFileSync(filePath, "utf-8");
    let formatType = "";
    if ([/\w+\s*\(.*\)\s*{[^]*}/, /\s*=>\s*/].every(reg => !reg.test(fileContent))) {
      formatType = /\n[\w.]+\s*=\s*".*";+\s/.test(fileContent) ? LANG_FORMAT_TYPE.nonObj : LANG_FORMAT_TYPE.obj;
    }
    if (formatType === "") return null;
    let indents = "";
    let tree: EntryTree = {};
    let prefix = "";
    let suffix = "";
    let innerVar = "";
    let keyQuotes = false;
    if (formatType === LANG_FORMAT_TYPE.nonObj) {
      fileContent = fileContent
        .replace(/\/\*[^]*?\*\/|(?<=["'`;\n]{1}\s*)\/\/[^\n]*|<!--[^]*?-->/g, "")
        .replace(/(\S+)(\s*=\s*)([^]+?);*\s*(?=\n\s*\S+\s*=|$)/g, '"$1":$3,');
    } else {
      const indentsMatch = fileContent.match(/{\s*\n(\s*)\S/);
      indents = indentsMatch ? indentsMatch[1] : "  ";
      const match = fileContent.match(/([^]*?)({[^]*})([^]*)/);
      if (match) {
        prefix = match[1];
        suffix = match[3];
        fileContent = match[2];
      }
      const spreadVarMatch = fileContent.match(/\n\s*\.\.\.\S+/g);
      if (spreadVarMatch) {
        innerVar = spreadVarMatch.join("");
        const spreadVarReg = new RegExp(`${spreadVarMatch.join("|")}`, "g");
        fileContent = fileContent.replace(spreadVarReg, "");
      }
      keyQuotes = /^{\s*["'`]/.test(fileContent.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ""));
    }
    tree = JSON5.parse(fileContent);
    // TODO vue-i18n 似乎支持值为字符串、数组、对象，甚至函数（返回字符串），这里的判断需要调整
    if (getNestedValues(tree).some(item => typeof item !== "string")) return null;
    return {
      data: tree,
      formatType,
      extraInfo: {
        indents,
        prefix,
        suffix,
        innerVar,
        keyQuotes
      }
    };
  } catch (e) {
    console.error(e);
    return null;
  }
}

export function getNestedValues(obj: EntryTree): string[] {
  let values: string[] = [];
  for (const key in obj) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      values = values.concat(getNestedValues(obj[key]));
    } else {
      values.push(obj[key]);
    }
  }
  return values;
}

export function flattenNestedObj(obj: EntryTree, res: EntryMap = {}, className = ""): EntryMap {
  for (const key in obj) {
    if (key.trim() === "") break;
    const value = obj[key];
    const keyName = className ? `${className}.${escapeString(key)}` : escapeString(key);
    if (typeof obj[key] === "object") {
      flattenNestedObj(value as EntryTree, res, keyName);
    } else {
      res[keyName] = value as string;
    }
  }
  return res;
}

export function validateLang(str: string, lang: string): boolean {
  let res = true;
  const code = getLangCode(lang, "google");
  switch (code) {
    case "zh-CN":
      res = /[\u4E00-\u9FA5\uF900-\uFA2D]+/.test(str);
      break;
    case "ru":
      res = /[а-яА-ЯЁё]/.test(str);
      break;
    case "ja":
      res = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(str);
      break;
    case "en":
      res = /^[a-zA-Z0-9!@#$%^&*()_+-=,.<>/?;:'"[\]{}|\\`~\s]*$/.test(str);
      break;
    case "ar":
      res = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str);
      break;
    case "th":
      res = /[\u0E00-\u0E7F]/.test(str);
      break;
  }
  return res;
}

export function getIdByStr(str: string, usedForEntryName = false): string {
  let id = str.toLowerCase();
  if (usedForEntryName) {
    id = id
      .split("")
      .filter(item => /[a-zA-Z0-9\s-]/.test(item))
      .join("");
    id = id.replace(/[\s-](\S)/g, (_, char: string) => char.toUpperCase()).replace(/-/g, "");
  }
  id = id.replace(/\s/g, "");
  return id;
}

export function formatObjectToString(tree: EntryTree, lookup: EntryMap, fileType = "json", extraInfo: FileExtraInfo): string {
  const { prefix = "", suffix = "", innerVar = "", indents = "  ", keyQuotes = true } = extraInfo;
  function needsQuotes(key: string): boolean {
    const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    return !validIdentifier.test(key);
  }
  const lineEnding = getLineEnding();
  function formatObject(obj: EntryTree, level = 0): string {
    const result: string[] = [];
    const currentIndent = indents.repeat(level);
    for (const [key, value] of Object.entries(obj)) {
      const keyStr = unescapeString(keyQuotes || fileType === "json" || needsQuotes(key) ? `"${key}"` : key);
      if (typeof value === "string" && value in lookup) {
        result.push(`${currentIndent}${keyStr}: ${formatForFile(lookup[value])}`);
      } else if (Object.prototype.toString.call(value) === "[object Object]") {
        const nestedValue = formatObject(value as EntryTree, level + 1);
        if (nestedValue) {
          result.push(`${currentIndent}${keyStr}: {${lineEnding}${nestedValue}${lineEnding}${currentIndent}}`);
        }
      }
    }
    return result.join(`,${lineEnding}`);
  }

  const output: string[] = [];
  output.push(prefix ? `${prefix}{` : "{");
  if (fileType === "js" && innerVar) {
    output.push(`${indents}${innerVar}`);
  }
  const formattedObj = formatObject(tree, 1);
  if (formattedObj) {
    output.push(formattedObj);
  }
  output.push(suffix ? `}${suffix}` : "}");
  return output.join(lineEnding);
}

export function formatForFile(str: string): string {
  return '"' + str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + '"';
}

export function catchAllEntries(fileContent: string, langType: string, entryTree: EntryTree) {
  let tItems: TEntry[] = [];
  if (langType === LANG_FORMAT_TYPE.nonObj) {
    tItems = catchCustomTEntries(fileContent);
  } else {
    tItems = catchTEntries(fileContent);
  }
  const existedItems = catchPossibleEntries(fileContent, langType, entryTree);
  return { tItems, existedItems };
}

export function catchPossibleEntries(fileContent: string, langType: string, entryTree: EntryTree): { name: string; pos: number }[] {
  const primaryClassList = Object.keys(entryTree).filter(i => !!i);
  if (primaryClassList.length === 0) return [];
  const primaryClassReg = new RegExp(
    `${langType === LANG_FORMAT_TYPE.nonObj ? "(?<![a-zA-Z0-9\\-]+)" : "(?<=[\"`']{1})"}(${primaryClassList.join("|")})[\\w.]*(?![:=/]{1})`,
    "g"
  );
  let primaryClassRes: RegExpExecArray | null = null;
  const entryInfoList: PEntry[] = [];
  while ((primaryClassRes = primaryClassReg.exec(fileContent)) !== null) {
    const startPos = primaryClassRes.index;
    const entryName = primaryClassRes[0];
    const entryFormList = entryName.split(LANG_ENTRY_SPLIT_SYMBOL[langType] as string);
    let curItem = "";
    let curTree = entryTree;
    let isValid = false;
    let isUndefined = false;
    const entryFormLen = entryFormList.length;
    for (let i = 0; i < entryFormLen; i++) {
      curItem = entryFormList[i];
      if (Object.hasOwn(curTree, curItem)) {
        if (curTree[curItem] === null) {
          isValid = true;
        } else {
          curTree = curTree[curItem] as EntryTree;
        }
      } else {
        isUndefined = i + 1 === entryFormLen;
        break;
      }
    }
    if (isValid) {
      entryInfoList.push({ name: entryName, pos: startPos });
    } else {
      let matchItems: any[] = [];
      const entryPrefixList = entryFormList.slice(0, -1);
      if (isUndefined) {
        matchItems = Object.keys(curTree).filter(item => curTree[item] === null && RegExp(`^${curItem}\\d*$`).test(item));
      } else if (curTree !== entryTree && langType === LANG_FORMAT_TYPE.nonObj) {
        entryPrefixList.push(curItem);
        matchItems = catchPossibleEntries(fileContent, langType, curTree);
      } else {
        entryInfoList.push({ name: entryName, pos: startPos });
      }
      matchItems.forEach(item => {
        entryInfoList.push({ name: [...entryPrefixList, item].join(LANG_ENTRY_SPLIT_SYMBOL[langType] as string), pos: startPos });
      });
    }
  }
  return entryInfoList;
}

export function catchTEntries(fileContent: string): TEntry[] {
  const tReg = /(?<=[$\s.[({:=]{1})t\s*\(\s*(\S)/g;
  const entryInfoList: TEntry[] = [];
  let tRes: RegExpExecArray | null;
  while ((tRes = tReg.exec(fileContent)) !== null) {
    const startPos = tRes.index - 1; // 起始位
    const offset = tRes[0].length; // 起始位离 t 函数内首个有效字符的距离
    const entry = parseTEntry(fileContent, startPos, offset);
    if (entry) {
      entryInfoList.push(entry);
    }
  }
  return entryInfoList;
}

export function parseTEntry(fileContent: string, startPos: number, offset: number): TEntry | null {
  let isValid = true;
  let curPos = startPos + offset;
  let symbolStr = fileContent[curPos];
  const tFormList: { type: string; value: string }[] = [];
  let entryIndex = 0;
  let entryText = "";
  let entryVar = {};
  let entryReg = "";
  let tRes: RegExpExecArray | null = null;
  let tempReg: RegExp | null = null;
  let tempStr = "";
  let tempList: string[] = [];
  const initSymbolStr = symbolStr;
  while (symbolStr !== ")") {
    if (/[\s+,]/.test(symbolStr)) {
      curPos++;
      symbolStr = fileContent[curPos];
      continue;
    }
    const matchResult = matchTEntryPart(fileContent, curPos, symbolStr);
    if (!matchResult) {
      isValid = false;
      break;
    }
    const { type, value } = matchResult;
    tFormList.push({ type, value: /["'`]/.test(symbolStr) ? value.slice(1, -1) : value });
    curPos += value.length;
    symbolStr = fileContent[curPos];
  }
  if (!isValid || tFormList.every(item => !["text", "varText"].includes(item.type))) {
    return null;
  }

  tFormList.forEach(item => {
    switch (item.type) {
      case "text":
        entryText += item.value;
        entryReg += escapeRegExp(item.value.replace(/\s/g, ""));
        break;
      case "varText":
        tempStr = item.value;
        tempReg = /\${\s*([^]*?)\s*}/g;
        while ((tRes = tempReg.exec(item.value)) !== null) {
          tempStr = tempStr.replace(tRes[0], `{t${entryIndex}}`);
          entryVar[`t${entryIndex++}`] = tRes[1];
        }
        entryText += tempStr;
        entryReg = escapeRegExp(entryText.replace(/\s/g, "")).replace(/\{.*?\}/g, ".*");
        isValid = isValid && entryText.replace(/\{\w*?\}/g, "") !== "";

        break;
      case "var":
        entryText += `{t${entryIndex}}`;
        entryVar[`t${entryIndex++}`] = item.value;
        entryReg += ".*";
        break;
      case "obj":
        tempList = [];
        tempReg = /{(\w*?)}/g;
        while ((tRes = tempReg.exec(entryText)) !== null) {
          tempList.push(tRes[1]);
        }
        entryVar = extractKeyValuePairs(item.value);
        if (tempList.length > 0 && Object.keys(entryVar).length === 0) {
          isValid = false;
        }
        break;
    }
  });

  const entryRaw = fileContent.slice(startPos, curPos + 1);
  let entryClass = "";
  let entryName = "";
  const nameRes = entryText.match(/%(\S*?)%([^]*)/);
  if (nameRes) {
    entryName = nameRes[1];
    entryText = nameRes[2];
  }
  const classRes = entryText.match(/#(\S*?)#([^]*)/);
  if (classRes) {
    entryClass = classRes[1];
    entryText = classRes[2];
  }
  if (Object.keys(entryVar).length === 0) {
    entryReg = `^${entryReg}\\d*$`;
  }
  isValid = isValid && isStringInUncommentedRange(fileContent, entryRaw);
  if (!isValid) return null;
  return {
    raw: entryRaw,
    text: entryText,
    var: entryVar,
    regex: new RegExp(entryReg),
    id: getIdByStr(entryText),
    class: entryClass,
    name: entryName,
    pos: startPos + (entryRaw.indexOf(initSymbolStr) + 1)
  };
}

export function extractKeyValuePairs(objStr: string) {
  const result = {};
  const trimmed = objStr.trim();

  // 去除前后的大括号
  const content = trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1) : trimmed;

  let current = "";
  let key = "";
  const braceStack: string[] = [];
  let inString = false;
  let stringChar = "";
  let isParsingKey = true;

  const commit = () => {
    if (key.trim()) {
      result[key.trim()] = current.trim();
    }
    key = "";
    current = "";
    isParsingKey = true;
  };

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = content[i - 1];

    if (inString) {
      if (char === stringChar && prevChar !== "\\") {
        inString = false;
      }
    } else {
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
      } else if (char === "{" || char === "[" || char === "(") {
        braceStack.push(char);
      } else if (char === "}" || char === "]" || char === ")") {
        braceStack.pop();
      } else if (char === ":" && isParsingKey && braceStack.length === 0) {
        isParsingKey = false;
        continue;
      } else if (char === "," && braceStack.length === 0) {
        commit();
        continue;
      }
    }

    if (isParsingKey) {
      key += char;
    } else {
      current += char;
    }
  }

  if (key) commit();
  return result;
}

export function matchTEntryPart(fileContent: string, startPos: number, symbolStr: string): { type: string; value: string } | null {
  let match: RegExpMatchArray | [number, string] | null = null;
  let type = "";
  if (/["'`]/.test(symbolStr)) {
    type = symbolStr === "`" ? "varText" : "text";
    match = fileContent.slice(startPos).match(new RegExp(`(${symbolStr}[^]*?(?<!\\\\)${symbolStr})`));
  } else if (/[\w(]/.test(symbolStr)) {
    type = "var";
    if (symbolStr === "(") {
      match = matchBrackets(fileContent, startPos, "(", ")");
    } else {
      match = fileContent.slice(startPos).match(new RegExp(`(${symbolStr}[\\w.]*)`));
    }
  } else if (symbolStr === "{") {
    type = "obj";
    match = matchBrackets(fileContent, startPos, "{", "}");
  }
  if (match) {
    return { type, value: match[1] };
  }
  return null;
}

export function matchBrackets(str: string, startPos = 0, open = "{", close = "}"): [number, string] | null {
  const stack: string[] = [];
  let start = -1;
  for (let i = startPos; i < str.length; i++) {
    const char = str[i];
    if (char === open) {
      if (stack.length === 0) start = i;
      stack.push(char);
    } else if (char === close) {
      stack.pop();
      if (stack.length === 0) {
        return [i, str.slice(start, i + 1)];
      }
    }
  }
  return null;
}

export function catchCustomTEntries(fileContent: string): TEntry[] {
  const customT = "lc@";
  const tReg = new RegExp(`(["'\`]){1}${customT}`, "g");
  const entryInfoList: TEntry[] = [];
  let tRes: RegExpMatchArray | null = null;
  while ((tRes = tReg.exec(fileContent)) !== null) {
    const tStartPos = tRes.index as number;
    const symbolStr = tRes[1];
    let entryText = "";
    let entryName = "";
    let entryClass = "";
    const match = fileContent.slice(tStartPos).match(new RegExp(`${symbolStr}${customT}([^]*?)(?<!\\\\)${symbolStr}`));
    if (match) {
      entryText = match[1];
      const nameRes = entryText.match(/%(\S*?)%([^]*)/);
      if (nameRes) {
        entryName = nameRes[1];
        entryText = nameRes[2];
      }
      const classRes = entryText.match(/#(\S*?)#([^]*)/);
      if (classRes) {
        entryClass = classRes[1];
        entryText = classRes[2];
      }
      const entryRegex = escapeRegExp(entryText.replace(/\s/g, ""));
      entryInfoList.push({
        raw: match[0],
        text: entryText,
        regex: new RegExp(entryRegex),
        id: getIdByStr(entryText),
        class: entryClass,
        name: entryName,
        pos: tStartPos
      });
    }
  }
  return entryInfoList;
}

export function isStringInUncommentedRange(code: string, searchString: string): boolean {
  const uncommentedCode = code
    .replace(/lc-disable([^]*?)(lc-enable|$)/g, "")
    .replace(/\/\*[^]*?\*\/|(?<!:\s*)\/\/[^\n]*|<!--[^]*?-->/g, "");
  return uncommentedCode.includes(searchString);
}

export function genLangTree(tree: EntryTree = {}, content: EntryTree = {}, type = ""): void {
  for (const key in content) {
    if (typeof content[key] === "object") {
      tree[key] = {};
      genLangTree(tree[key], content[key], type);
    } else {
      tree[key] = type === "string" ? content[key] : content[key].replace(/\s/g, "");
    }
  }
}

export function traverseLangTree(EntryTree: EntryTree, callback: (key: string, value: any) => void, prefix = ""): void {
  for (const key in EntryTree) {
    if (typeof EntryTree[key] === "object") {
      traverseLangTree(EntryTree[key], callback, prefix ? `${prefix}.${key}` : key);
    } else {
      callback(prefix + key, EntryTree[key]);
    }
  }
}

export function getLangTree(obj: object | string): string {
  if (typeof obj !== "object") return "";
  return Object.keys(obj).some(key => typeof obj[key] === "object") ? "object" : "string";
}

export function getEntryFromLangTree(EntryTree: EntryTree, key: string): string {
  let res = "";
  const blockList = key.split(".");
  for (let i = 0; i < blockList.length; i++) {
    const prefix = blockList.slice(0, i + 1).join(".");
    if (getLangTree(EntryTree[prefix] as object) === "object") {
      res = getEntryFromLangTree(EntryTree[prefix] as EntryTree, blockList.slice(i + 1).join("."));
      if (res) break;
    } else if (getLangTree(EntryTree[prefix] as string) === "string") {
      res = EntryTree[prefix] as string;
      break;
    }
  }
  return res;
}

export function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/\./g, "\\.");
}

export function unescapeString(str: string): string {
  return str.replace(/\\\./g, ".").replace(/\\\\/g, "\\");
}

export function parseEscapedPath(path: string): string[] {
  const result: string[] = [];
  let current = "";
  let escaping = false;
  for (let i = 0; i < path.length; i++) {
    const char = path[i];
    if (escaping) {
      current += char;
      escaping = false;
    } else if (char === "\\") {
      escaping = true;
    } else if (char === ".") {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (escaping) {
    throw new Error("Invalid escape sequence at end of string");
  }
  if (current.length > 0) {
    result.push(current);
  }
  return result;
}

export function setValueByEscapedEntryName(EntryTree: EntryTree, escapedPath: string, value: string | undefined): void {
  const pathParts = parseEscapedPath(escapedPath);
  let current = EntryTree;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (current[part] === undefined || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as EntryTree;
  }
  current[pathParts[pathParts.length - 1]] = value as string;
}

export function getValueByAmbiguousEntryName(EntryTree: EntryTree, ambiguousPath: string): string | undefined {
  if (typeof EntryTree !== "object" || EntryTree === null) {
    return undefined;
  }
  const parts = ambiguousPath.split(".");
  const m = parts.length;
  if (m === 0) {
    return undefined;
  }
  const numCombinations = 1 << (m - 1);
  for (let i = 0; i < numCombinations; i++) {
    const split = buildSplit(parts, i, m);
    const value = accessPath(EntryTree, split);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function getPathSegsFromId(id: string): string[] {
  // 1. 用正则一次性按 “\\.”（转义点） 或者 非“.” 字符的连续串 拆分
  const rawSegs = id.match(/(\\\.|[^.])+/g);
  if (!rawSegs) return [];
  // 2. 把每段里的 "\." 恢复成真正的 "."
  return rawSegs.map(seg => seg.replace(/\\\./g, "."));
}

export function getFileLocationFromId(id: string, fileStructure: EntryNode): string[] | null {
  const segments = getPathSegsFromId(id);
  const pathSegs: string[] = [];
  let node: EntryNode = fileStructure;
  for (const seg of segments) {
    if (node.type === "directory" && node.children && seg in node.children) {
      pathSegs.push(seg);
      node = node.children[seg];
    } else {
      break;
    }
  }
  if (node.type !== "file") return null; // 路径在结构里不存在
  return pathSegs;
}

export function getContentAtLocation(location: string, tree: EntryTree): EntryTree | null {
  const segments = getPathSegsFromId(location);
  let cursor: EntryTree = tree;
  for (const seg of segments) {
    if (typeof cursor === "object" && seg in cursor) {
      cursor = cursor[seg] as EntryTree;
    } else {
      return null;
    }
  }
  return cursor;
}

function buildSplit(parts: string[], i: number, m: number): string[] {
  const split: string[] = [];
  let current = parts[0];
  for (let j = 0; j < m - 1; j++) {
    if ((i & (1 << j)) !== 0) {
      current += "." + parts[j + 1];
    } else {
      split.push(current);
      current = parts[j + 1];
    }
  }
  split.push(current);
  return split;
}

function accessPath(obj: EntryTree | string, path: string[]): string | undefined {
  let current = obj;
  for (const key of path) {
    if (Boolean(current) && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current as string;
}

export async function selectProperty(uri: vscode.Uri, key: string) {
  // 1. 拆分并还原转义的点
  const parts = key.split(/(?<!\\)\./).map(p => p.replace(/\\\./g, "."));
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const text = doc.getText();
  let searchStart = 0;
  let rangeStart: number | undefined;
  // 2. 对于多层嵌套重复查找大括号范围
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    const isLast = i === parts.length - 1;
    const keyEsc = escapeReg(key);
    const lookaround = `(?<![\\w$])["']?${keyEsc}["']?(?![\\w$])`;
    const suffix = isLast ? `` : `\\s*\\{`;
    const pat = new RegExp(lookaround + `\\s*:` + suffix);
    const m = pat.exec(text.slice(searchStart));
    // 未找到属性 key
    if (!m) {
      return;
    }
    const matchIndex = searchStart + m.index;
    if (isLast) {
      // 最后一级，直接定位属性名开始
      const offset = matchIndex + m[0].indexOf(key);
      rangeStart = offset;
      break;
    } else {
      // 非最后一级，进入对象体
      const objStart = matchIndex + m[0].length;
      const subText = text.slice(objStart);
      const closeIdx = findMatchingBrace(subText);
      // 对象 key 的大括号不匹配
      if (closeIdx < 0) {
        return;
      }
      // 更新下一轮搜索的起点，只在当前对象内部查找
      searchStart = objStart;
      // 将搜索结束设置为 objStart + closeIdx，以便不越界
      // 通过修改 textSlice 在 exec 时自动限制
    }
  }
  // 3. 设置选区并高亮属性名
  if (rangeStart !== undefined) {
    const startPos = doc.positionAt(rangeStart);
    const endPos = startPos.translate(0, parts[parts.length - 1].length);
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(new vscode.Range(startPos, endPos));
  }
}

// 转义正则元字符
function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 找到字符串中第一个 '}' 与对应 '{' 的匹配位置
function findMatchingBrace(text: string): number {
  let depth = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
