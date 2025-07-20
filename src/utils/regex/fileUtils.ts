import fs from "fs";
import path from "path";
import JSON5 from "json5";
import { escapeString } from "./stringUtils";
import { LANG_FORMAT_TYPE } from "@/utils/langKey";
import { LangTree, FileExtraInfo, LangFileInfo, EntryNode, EntryMap, EntryTree, I18nFramework, I18N_FRAMEWORK, QuoteStyle } from "@/types";
import { getFirstOrLastDirName, isPathInsideDirectory, isSamePath } from "../fs";
import { getCacheConfig } from "../config";

export function isValidI18nCallablePath(inputPath: string): boolean {
  const { ignoredFiles, ignoredDirectories } = getCacheConfig();
  const normalizedPath = path.normalize(inputPath);
  // 判断是否是文件或目录
  let isDirectory = false;
  try {
    isDirectory = fs.statSync(normalizedPath).isDirectory();
  } catch {
    // 路径不存在时默认按文件处理
    isDirectory = false;
  }
  // 检查是否被忽略
  if (
    ignoredFiles.some(ignoredFile => isSamePath(normalizedPath, ignoredFile)) ||
    ignoredDirectories.some(ignoredDir => isPathInsideDirectory(ignoredDir, normalizedPath))
  ) {
    return false;
  }
  const firstDirName = getFirstOrLastDirName(normalizedPath, isDirectory);
  const IGNORED_NAME_REGEX = /^(dist|node_modules|img|image|css|asset|build|out|\.)/i;
  if (IGNORED_NAME_REGEX.test(firstDirName)) return false;
  // 如果是文件，检查扩展名
  if (!isDirectory) {
    const ext = path.extname(normalizedPath);
    const supportedExt = [".js", ".ts", ".jsx", ".tsx", ".vue", ".html"];
    if (!supportedExt.includes(ext)) return false;
  }
  return true;
}

export function getLangFileInfo(filePath: string): LangFileInfo | null {
  try {
    let fileContent = fs.readFileSync(filePath, "utf-8");
    let formatType = "";
    if ([/\w+\s*\(.*\)\s*{[^]*}/, /\s*=>\s*/].every(reg => !reg.test(fileContent))) {
      formatType = /\n[\w.]+\s*=\s*".*";+\s/.test(fileContent) ? LANG_FORMAT_TYPE.nonObj : LANG_FORMAT_TYPE.obj;
    }
    if (formatType === "") return null;
    let tree: EntryTree = {};
    let prefix = "";
    let suffix = "";
    let innerVar = "";
    const { key: keyQuotes, value: valueQuotes } = detectQuoteStyle(fileContent);
    const indentSize = detectIndentSize(fileContent);
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
    tree = JSON5.parse(fileContent);
    // TODO vue-i18n 似乎支持值为字符串、数组、对象，甚至函数（返回字符串），这里的判断需要调整
    if (getNestedValues(tree).some(item => typeof item !== "string")) return null;
    return {
      data: tree,
      formatType,
      extraInfo: {
        indentSize,
        prefix,
        suffix,
        innerVar,
        keyQuotes,
        valueQuotes
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

export function flattenNestedObj(obj: EntryTree, className = ""): { data: EntryMap; isFlat: boolean } {
  const result: EntryMap = {};
  let isFlat = true;
  for (const key in obj) {
    if (key.trim() === "") continue;
    const value = obj[key];
    const escapedKey = escapeString(key);
    const keyName = className ? `${className}.${escapedKey}` : escapedKey;
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      const child = flattenNestedObj(value, keyName);
      Object.assign(result, child.data);
      isFlat = false;
    } else {
      result[keyName] = value as string;
    }
  }
  return { data: result, isFlat };
}

export interface ExtractResult {
  fileType: string; // 最终使用的文件后缀
  formatType: string; // 最终使用的格式
  langTree: LangTree; // 语言数据树
  fileExtraInfo: Record<string, FileExtraInfo>;
  fileStructure: EntryNode; // 带 type 标记的文件树
}

export function extractLangDataFromDir(langPath: string): ExtractResult | null {
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

  const { tree: langTree, node: fileStructure, hasData } = traverse(langPath, []);
  if (!hasData) return null;

  return {
    fileType: validFileType,
    formatType: validFormatType,
    langTree,
    fileExtraInfo,
    fileStructure
  };
}

export function detectI18nFramework(projectRoot: string): I18nFramework | null {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  const pkg: { dependencies: Record<string, string>; devDependencies: Record<string, string>; engines?: Record<string, string> } =
    JSON5.parse(fs.readFileSync(pkgPath, "utf-8"));
  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies
  };
  const checks = [
    { name: I18N_FRAMEWORK.vueI18n, key: "vue-i18n" },
    { name: I18N_FRAMEWORK.reactI18next, key: "react-i18next" },
    { name: I18N_FRAMEWORK.i18nNext, key: "i18next" }
  ];
  for (const check of checks) {
    if (deps[check.key]) {
      return check.name;
    }
  }
  if (pkg.engines?.vscode !== undefined && typeof pkg.engines.vscode === "string") {
    return I18N_FRAMEWORK.vscodeL10n;
  }
  return null;
}

export function detectQuoteStyle(code: string): {
  key: QuoteStyle;
  value: QuoteStyle;
} {
  const keyCount: Record<QuoteStyle, number> = { single: 0, double: 0, none: 0 };
  const valueCount: Record<QuoteStyle, number> = { single: 0, double: 0, none: 0 };
  const pairRegex = /(?<key>'[^']*'|"[^"]*"|[a-zA-Z0-9_]+)\s*:\s*(?<value>'[^']*'|"[^"]*")/g;
  let match: RegExpExecArray | null = null;
  while ((match = pairRegex.exec(code)) !== null) {
    const { key, value } = match.groups!;
    if (key.startsWith("'")) keyCount["single"]++;
    else if (key.startsWith('"')) keyCount["double"]++;
    else keyCount["none"]++;
    if (value.startsWith("'")) valueCount["single"]++;
    else if (value.startsWith('"')) valueCount["double"]++;
  }
  const mostUsed = (counts: Record<QuoteStyle, number>): QuoteStyle =>
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as QuoteStyle;
  return {
    key: mostUsed(keyCount),
    value: mostUsed(valueCount)
  };
}

export function detectIndentSize(fileContent: string): number {
  const lines = fileContent.split("\n");
  const indents: number[] = [];
  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("//")) continue;
    const match = line.match(/^(\s+)\S/);
    if (!match) continue;
    const indent = match[1];
    if (indent.includes("\t")) continue; // 忽略 tab
    indents.push(indent.length);
  }
  if (indents.length < 2) return 2;
  // 计算相邻缩进之间的正整数差值
  const diffs: number[] = [];
  for (let i = 1; i < indents.length; i++) {
    const diff = Math.abs(indents[i] - indents[i - 1]);
    if (diff > 0 && diff <= 8) diffs.push(diff); // 限定最大缩进层级为8以内
  }
  const count: Record<number, number> = {};
  for (const d of diffs) count[d] = (count[d] || 0) + 1;
  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
  return sorted.length ? Number(sorted[0][0]) : 2;
}
