import fs from "fs";
import path from "path";
import JSON5 from "json5";
import { escapeString } from "./stringUtils";
import { LANG_FORMAT_TYPE } from "@/utils/langKey";
import { LangTree, FileExtraInfo, LangFileInfo, EntryNode, EntryMap, EntryTree } from "@/types";

export function isIgnoredDir(dir: string): boolean {
  const ignoredDirRegex = /^(dist|node_modules|img|image|css|asset|\.)/i;
  return ignoredDirRegex.test(dir);
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
