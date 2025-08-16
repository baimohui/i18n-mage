import fs from "fs";
import vm from "node:vm";
import path from "path";
import JSON5 from "json5";
import { escapeString } from "./stringUtils";
import { LangTree, FileExtraInfo, LangFileInfo, EntryNode, EntryMap, EntryTree, I18nFramework, I18N_FRAMEWORK, QuoteStyle } from "@/types";
import { getFirstOrLastDirName, isPathInsideDirectory, isSamePath } from "../fs";
import { getCacheConfig } from "../config";
import { NotificationManager } from "../notification";
import { t } from "../i18n";

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
    NotificationManager.logToOutput(t("command.parseLangFile.title", filePath), "info");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const [prefix, content, suffix] = extractContentByLevel(fileContent, 1);
    if (content) {
      let jsonObj = content;
      const { key: keyQuotes, value: valueQuotes } = detectQuoteStyle(jsonObj);
      const indentSize = detectIndentSize(jsonObj);
      let innerVar = "";
      const varMatch = jsonObj.match(/^{\s*([^"']*,[^]*?)\r?\n/);
      if (varMatch) {
        innerVar = varMatch[1];
        jsonObj = jsonObj.replace(innerVar, "");
      }
      const tree = jsonParse(jsonObj);
      if (tree !== null) {
        const extraInfo = {
          indentSize,
          nestedLevel: 1,
          prefix,
          suffix,
          innerVar,
          keyQuotes,
          valueQuotes
        } as FileExtraInfo;
        NotificationManager.logToOutput(t("command.parseLangFile.success", JSON.stringify(extraInfo)), "info");
        return {
          data: tree,
          extraInfo
        };
      }
    }
    return null;
  } catch (e) {
    NotificationManager.logToOutput((e as Error).message, "error");
    return null;
  }
}

export function jsonParse(content: string) {
  const { languageFileParser } = getCacheConfig();
  if (languageFileParser === "json5") {
    return json5Parse(content);
  } else if (languageFileParser === "eval") {
    return safeEvalParse(content);
  } else if (languageFileParser === "auto") {
    let result = json5Parse(content);
    if (result === null) {
      result = safeEvalParse(content);
    }
    return result;
  }
  return null;
}

export function json5Parse(content: string): EntryTree | null {
  try {
    return JSON5.parse(content);
  } catch (e) {
    NotificationManager.logToOutput(t("command.parseLangFile.json5Error", (e as Error).message), "error");
    return null;
  }
}

export function safeEvalParse(content: string) {
  try {
    const script = new vm.Script(`(${content})`);
    const sandbox: Record<string, unknown> = {};
    const context = vm.createContext(sandbox);
    return script.runInContext(context, { timeout: 500 }) as EntryTree;
  } catch (e) {
    NotificationManager.logToOutput(t("command.parseLangFile.evalError", (e as Error).message), "error");
    return null;
  }
}

export function extractContentByLevel(content: string, level: number): [string, string, string] {
  if (level < 1) {
    throw new Error("层级数必须大于等于1");
  }
  const openBraces: number[] = []; // 存储所有 { 的位置
  const closeBraces: number[] = []; // 存储所有 } 的位置
  // 遍历内容，记录所有 { 和 } 的位置
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "{") {
      openBraces.push(i);
    } else if (content[i] === "}") {
      closeBraces.push(i);
    }
  }
  // 检查是否有足够的 { 和 }
  if (openBraces.length < level || closeBraces.length < level) {
    throw new Error(`内容中没有足够的层级 ${level} 的 { }`);
  }
  // 计算开始和结束位置
  const startIndex = openBraces[level - 1]; // 第 level 个 {
  const endIndex = closeBraces[closeBraces.length - level]; // 倒数第 level 个 }
  // 检查顺序是否正确
  if (startIndex >= endIndex) {
    throw new Error(`层级 ${level} 的 { 出现在 } 之后`);
  }
  // 分割内容
  const before = content.substring(0, startIndex);
  const matched = content.substring(startIndex, endIndex + 1);
  const after = content.substring(endIndex + 1);
  return [before, matched, after];
}

export function getNestedValues(obj: EntryTree | string[]): string[] {
  let values: string[] = [];
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      values = values.concat(getNestedValues(obj[key] as EntryTree | string[]));
    } else if (typeof obj[key] === "string") {
      values.push(obj[key]);
    }
  });
  return values;
}

export function flattenNestedObj(obj: EntryTree | string[], className = ""): { data: EntryMap; depth: number } {
  const result: EntryMap = {};
  let maxDepth = 0;
  const traverse = (node: EntryTree | string[], prefix: string, depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    Object.keys(node).forEach(key => {
      if (key.trim() === "") return;
      const value = node[key] as EntryTree;
      const escapedKey = escapeString(key);
      const fullKey = prefix ? `${prefix}.${escapedKey}` : escapedKey;
      if (value != null && typeof value === "object") {
        traverse(value, fullKey, depth + 1);
      } else if (typeof value === "string") {
        result[fullKey] = value;
      }
    });
  };
  traverse(obj, className, 0);
  return { data: result, depth: maxDepth };
}

export interface ExtractResult {
  fileType: string; // 最终使用的文件后缀
  langTree: LangTree; // 语言数据树
  fileExtraInfo: Record<string, FileExtraInfo>;
  fileStructure: EntryNode; // 带 type 标记的文件树
  fileNestedLevel: number; // 文件树最大嵌套层级
}

export function extractLangDataFromDir(langPath: string): ExtractResult | null {
  let validFileType = "";
  const fileExtraInfo: Record<string, FileExtraInfo> = {};
  let fileNestedLevel = 0;

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
          fileNestedLevel = Math.max(fileNestedLevel, subPathSegs.length);
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
        const { data, extraInfo } = info;

        validFileType ||= ext;

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
    langTree,
    fileExtraInfo,
    fileStructure,
    fileNestedLevel
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
    if (key.startsWith('"')) keyCount["double"]++;
    else if (key.startsWith("'")) keyCount["single"]++;
    else keyCount["none"]++;
    if (value.startsWith('"')) valueCount["double"]++;
    else if (value.startsWith("'")) valueCount["single"]++;
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
  const defaultIndentSize = 4;
  const indents: number[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
    const match = line.match(/^(\s+)\S/);
    if (!match) continue;
    const indent = match[1];
    if (indent.includes("\t")) continue;
    indents.push(indent.length);
  }
  // if (indents.length < 5) return defaultIndentSize; // 提高默认值并增加最小样本要求
  // 计算缩进差值和原始缩进
  const candidates: number[] = [];
  for (let i = 1; i < indents.length; i++) {
    const diff = Math.abs(indents[i] - indents[i - 1]);
    if (diff > 0 && diff <= 8) candidates.push(diff);
  }
  candidates.push(...indents.filter(n => n <= 8 && n > 0));
  const count: Record<number, number> = {};
  for (const d of candidates) count[d] = (count[d] || 0) + 1;
  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
  return sorted.length ? Number(sorted[0][0]) : defaultIndentSize; // 更常见的默认值
}
