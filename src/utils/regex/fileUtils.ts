import fs from "fs";
import vm from "node:vm";
import path from "path";
import JSON5 from "json5";
import YAML from "js-yaml";
import { escapeString } from "./stringUtils";
import {
  LangTree,
  FileExtraInfo,
  LangFileInfo,
  EntryNode,
  EntryMap,
  EntryTree,
  I18nFramework,
  I18N_FRAMEWORK,
  DirNode,
  QuoteStyle4Key,
  QuoteStyle4Value
} from "@/types";
import { isPathInsideDirectory, isSamePath, toRelativePath } from "../fs";
import { getCacheConfig } from "../config";
import { NotificationManager } from "../notification";
import { t } from "../i18n";

export function isValidI18nCallablePath(inputPath: string, isDirectoryHint?: boolean): boolean {
  const ignoredFiles = getCacheConfig<string[]>("workspace.ignoredFiles");
  const ignoredDirectories = getCacheConfig<string[]>("workspace.ignoredDirectories");
  const languagePath = getCacheConfig<string>("workspace.languagePath");
  const fileExtensions = getCacheConfig<string[]>("analysis.fileExtensions");
  const normalizedPath = path.normalize(inputPath);
  // 判断是否是文件或目录
  let isDirectory = isDirectoryHint ?? false;
  if (isDirectoryHint === undefined) {
    try {
      isDirectory = fs.statSync(normalizedPath).isDirectory();
    } catch {
      // 路径不存在时默认按文件处理
      isDirectory = false;
    }
  }
  // 检查是否被忽略
  if (
    ignoredFiles.some(ignoredFile => isSamePath(normalizedPath, ignoredFile)) ||
    [...ignoredDirectories, languagePath].some(ignoredDir => isPathInsideDirectory(ignoredDir, normalizedPath))
  ) {
    return false;
  }
  const dirParts = toRelativePath(normalizedPath).split("/");
  const IGNORED_NAME_REGEX = /^(node_modules|\..+)$/i;
  if (dirParts.some(dirPart => IGNORED_NAME_REGEX.test(dirPart))) return false;
  // 如果是文件，检查扩展名
  if (!isDirectory) {
    const ext = path.extname(normalizedPath);
    if (!fileExtensions.includes(ext)) return false;
  }
  return true;
}

export function getLangFileInfo(filePath: string): LangFileInfo | null {
  try {
    NotificationManager.logToOutput(t("command.parseLangFile.title", filePath), "info");
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
    if (ext === "yaml" || ext === "yml") {
      const tree = parseLanguageContent(fileContent, ext);
      if (tree === null) return null;
      const { type, size } = detectIndent(fileContent);
      const isFlat = Object.keys(tree).every(key => typeof tree[key] !== "object");
      const extraInfo = {
        indentType: type,
        indentSize: size,
        prefix: "",
        suffix: "",
        innerVar: "",
        keyQuotes: "none" as const,
        isFlat,
        valueQuotes: "double" as const
      };
      NotificationManager.logToOutput(t("command.parseLangFile.success", JSON.stringify(extraInfo)), "info");
      return {
        data: tree,
        extraInfo
      };
    }

    const [prefix, content, suffix] = extractContent(fileContent);
    if (!content) return null;
    let jsonObj = content;
    const { key: keyQuotes, value: valueQuotes } = detectQuoteStyle(jsonObj);
    const { type, size } = detectIndent(jsonObj);
    let tree = parseLanguageContent(jsonObj, ext);
    let innerVar = "";
    if (tree === null) {
      const varMatch = jsonObj.match(/^{\s*([^"']*,[^]*?)\r?\n/);
      if (varMatch) {
        innerVar = varMatch[1];
        jsonObj = jsonObj.replace(innerVar, "");
        tree = parseLanguageContent(jsonObj, ext);
      }
    }
    if (tree === null) return null;
    const isFlat = Object.keys(tree).every(key => typeof tree[key] !== "object");
    const extraInfo = {
      indentType: type,
      indentSize: size,
      prefix,
      suffix,
      innerVar,
      keyQuotes,
      isFlat,
      valueQuotes
    };
    NotificationManager.logToOutput(t("command.parseLangFile.success", JSON.stringify(extraInfo)), "info");
    return {
      data: tree,
      extraInfo
    };
  } catch (e) {
    NotificationManager.logToOutput((e as Error).message, "error");
    return null;
  }
}

export function parseLanguageContent(content: string, ext: string): EntryTree | null {
  if (ext === "yaml" || ext === "yml") {
    return yamlParse(content);
  }
  return jsonParse(content);
}

export function jsonParse(content: string): EntryTree | null {
  let result = json5Parse(content);
  if (result === null) {
    result = safeEvalParse(content);
  }
  return result;
}

export function yamlParse(content: string): EntryTree | null {
  try {
    const parsed = YAML.load(content);
    if (parsed == null) return {};
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      NotificationManager.logToOutput(t("command.parseLangFile.yamlError", "Root node must be an object"), "error");
      return null;
    }
    return parsed as EntryTree;
  } catch (e) {
    NotificationManager.logToOutput(t("command.parseLangFile.yamlError", (e as Error).message), "error");
    return null;
  }
}

export function json5Parse(content: string): EntryTree | null {
  try {
    return JSON5.parse(content);
  } catch (e) {
    NotificationManager.logToOutput(t("command.parseLangFile.json5Error", (e as Error).message), "error");
    return null;
  }
}

export function safeEvalParse(content: string): EntryTree | null {
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

export function extractContent(content: string): [string, string, string] {
  const N = content.length;

  function findMatchingBrace(start: number): number {
    let inSingle = false,
      inDouble = false,
      inTemplate = false;
    let inLineComment = false,
      inBlockComment = false;
    let templateExprDepth = 0,
      depth = 0;

    for (let i = start; i < N; i++) {
      const ch = content[i];
      const next = content[i + 1];

      // 处理注释和字符串状态
      if (inLineComment) {
        if (ch === "\n") inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i++;
        }
        continue;
      }
      if (inSingle) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === "'") inSingle = false;
        continue;
      }
      if (inDouble) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === '"') inDouble = false;
        continue;
      }
      if (inTemplate) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === "$" && next === "{") {
          templateExprDepth++;
          i++;
          continue;
        }
        if (ch === "`" && templateExprDepth === 0) {
          inTemplate = false;
          continue;
        }
        if (ch === "}" && templateExprDepth > 0) {
          templateExprDepth--;
          continue;
        }
        continue;
      }

      // 进入新状态
      if (ch === "/" && next === "/") {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === "`") {
        inTemplate = true;
        continue;
      }

      // 花括号计数（只在有效代码区域）
      const braceActive = !inSingle && !inDouble && !inLineComment && !inBlockComment && (!inTemplate || templateExprDepth > 0);

      if (braceActive) {
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) return i;
        }
      }
    }
    return -1;
  }

  function isLikelyTargetStart(start: number): boolean {
    const leftAll = content.slice(0, start);
    if (leftAll.trim() === "") return true; // JSON 文件

    const lineStart = Math.max(0, leftAll.lastIndexOf("\n"));
    const linePrefix = leftAll.slice(lineStart, start).trim();

    // 简化匹配规则
    return /[=:]$/.test(linePrefix) || /\b(export|module\.exports|const|let|var|default)\b/.test(linePrefix) || linePrefix.includes("=");
  }

  // 主扫描逻辑
  for (let i = 0; i < N; i++) {
    const ch = content[i];

    if (ch === "{") {
      const end = findMatchingBrace(i);
      if (end !== -1 && isLikelyTargetStart(i)) {
        return [content.substring(0, i), content.substring(i, end + 1), content.substring(end + 1)];
      }
    }
  }

  throw new Error("未能提取到对象内容");
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

export function flattenNestedObj(obj: EntryTree | string[], isKeyEscaped = false): EntryMap {
  const result: EntryMap = {};
  const traverse = (node: EntryTree | string[], prefix: string, depth: number) => {
    Object.keys(node).forEach(key => {
      if (key.trim() === "") return;
      const value = node[key] as EntryTree;
      const escapedKey = isKeyEscaped ? key : escapeString(key);
      const fullKey = prefix ? `${prefix}.${escapedKey}` : escapedKey;
      if (value != null && typeof value === "object") {
        traverse(value, fullKey, depth + 1);
      } else if (typeof value === "string") {
        result[fullKey] = value;
      }
    });
  };
  traverse(obj, "", 0);
  return result;
}

export function expandDotKeys(obj: EntryTree | string[] | string) {
  if (Array.isArray(obj)) return obj;
  if (typeof obj !== "object" || obj === null) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split(".");
    let current = result;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = expandDotKeys(value);
      } else {
        current[part] ??= {};
        current = current[part] as EntryTree;
      }
    }
  }
  return result;
}

export interface ExtractResult {
  fileType: string; // 最终使用的文件后缀
  langTree: LangTree; // 语言数据树
  fileExtraInfo: Record<string, FileExtraInfo>;
  fileStructure: DirNode; // 带 type 标记的文件树
  fileNestedLevel: number; // 文件树平均嵌套层级（保留两位小数）
}

export function extractLangDataFromDir(langPath: string): ExtractResult | null {
  let validFileType = "";
  const fileExtraInfo: Record<string, FileExtraInfo> = {};
  let fileNestedLevel = 0;
  let totalFileNestedLevel = 0;
  let fileCount = 0;

  function traverse(
    dir: string,
    pathSegs: string[]
  ): {
    tree: LangTree;
    node: DirNode;
    hasData: boolean;
  } {
    const tree: LangTree = {};
    const node: DirNode = { type: "directory", children: {} };
    let hasData = false;

    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, dirent.name);

      if (dirent.isDirectory()) {
        const subPathSegs = [...pathSegs, dirent.name];
        const { tree: subTree, node: subNode, hasData: ok } = traverse(fullPath, subPathSegs);
        if (ok) {
          tree[dirent.name] = subTree;
          node.children[dirent.name] = subNode;
          hasData = true;
        }
      } else {
        const fileNameMatch = dirent.name.match(/^(.*)\.([^.]+)$/);
        if (fileNameMatch === null) continue;
        const [, base, extRaw] = fileNameMatch;
        const ext = extRaw.toLowerCase();
        if (!/^(json|js|ts|json5|mjs|cjs|yaml|yml)$/.test(ext) || (validFileType && ext !== validFileType) || base === "index") {
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
        node.children[base] = { type: "file", ext };
        hasData = true;
        // 统计文件嵌套层级（目录深度）
        totalFileNestedLevel += pathSegs.length;
        fileCount++;
        // 生成位置键：pathSegs + base
        const locationKey = [...pathSegs, base].join(".");
        fileExtraInfo[locationKey] = extraInfo;
      }
    }
    return { tree, node, hasData };
  }

  const { tree: langTree, node: fileStructure, hasData } = traverse(langPath, []);
  if (!hasData) return null;
  if (fileCount > 0) {
    fileNestedLevel = Number((totalFileNestedLevel / fileCount).toFixed(2));
  }

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

/**
 * 将语言目录结构转化为不包含语言名称的结构
 * @param root 原始结构
 * @returns DirNode | null
 */
export function stripLanguageLayer(root: DirNode): DirNode | null {
  const children = root.children;

  // 判断是否所有子节点都是文件（语言文件的情况）
  const allFiles = Object.values(children).every(c => c.type === "file");
  if (allFiles) {
    return null;
  }

  // 情况：每个子节点是一个语言目录
  const mergedChildren: Record<string, EntryNode> = {};

  for (const lang of Object.keys(children)) {
    const node = children[lang];
    if (node.type !== "directory") {
      // 出现非目录，说明不是标准语言结构，直接忽略
      continue;
    }

    // 遍历语言目录的子项
    for (const [name, child] of Object.entries(node.children)) {
      if (!Object.hasOwn(mergedChildren, name)) {
        // 直接拷贝
        mergedChildren[name] = JSON.parse(JSON.stringify(child)) as EntryNode;
      } else {
        // 已存在 -> 合并
        const existing = mergedChildren[name];
        if (existing.type === "directory" && child.type === "directory") {
          // 递归合并目录
          existing.children = {
            ...existing.children,
            ...child.children
          };
        }
        // 如果都是 file，直接保持一致即可
        // 如果一边是 file 一边是 directory，优先保持 directory
        if (existing.type === "file" && child.type === "directory") {
          mergedChildren[name] = JSON.parse(JSON.stringify(child)) as EntryNode;
        }
      }
    }
  }

  return { type: "directory", children: mergedChildren };
}

export function detectQuoteStyle(code: string): {
  key: QuoteStyle4Key;
  value: QuoteStyle4Value;
} {
  const keyCount: Record<QuoteStyle4Key, number> = { single: 0, double: 0, none: 0, auto: 0 };
  const valueCount: Record<QuoteStyle4Value, number> = { single: 0, double: 0, auto: 0 };
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
  const mostUsed = (counts: Record<QuoteStyle4Key, number>): QuoteStyle4Key =>
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as QuoteStyle4Key;

  const mostUsedValue = (counts: Record<QuoteStyle4Value, number>): QuoteStyle4Value =>
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as QuoteStyle4Value;
  return {
    key: mostUsed(keyCount),
    value: mostUsedValue(valueCount)
  };
}

/**
 * 估算文件的默认缩进风格与宽度。
 * 支持空格与 Tab。
 * - 若文件混合缩进比例过高，返回默认 { type: 'space', size: 4 }。
 */
export function detectIndent(fileContent: string): { type: "space" | "tab"; size: number } {
  const DEFAULT = { type: "space" as const, size: 4 };
  const MAX_INDENT = 64;
  const COMMON_MAX = 8;
  const MIN_SAMPLES = 3;
  const RELIABLE_COVER = 0.8;
  const FALLBACK_COVER = 0.6;

  const lines = fileContent.split(/\r?\n/);
  const spaceIndents: number[] = [];
  const tabIndents: number[] = [];

  for (const raw of lines) {
    if (!raw || !raw.trim()) continue;
    if (/^\s*(\/\/|\/\*|\*)/.test(raw)) continue;
    const m = raw.match(/^(\s+)\S/);
    if (!m) continue;
    const ws = m[1];
    const hasTab = /\t/.test(ws);
    const hasSpace = / /.test(ws);
    if (hasTab && hasSpace) continue; // 混缩跳过
    const n = ws.length;
    if (n > 0 && n <= MAX_INDENT) {
      if (hasTab) tabIndents.push(n);
      else spaceIndents.push(n);
    }
  }

  // 判断主缩进类型
  const total = tabIndents.length + spaceIndents.length;
  if (total < MIN_SAMPLES) return DEFAULT;
  const tabRatio = tabIndents.length / total;
  const spaceRatio = spaceIndents.length / total;

  // 若 Tab 比例高，直接判定为 Tab
  if (tabRatio >= 0.8) return { type: "tab", size: 1 };
  if (spaceRatio >= 0.8) {
    return { type: "space", size: detectSpaceIndentSize(spaceIndents) };
  }
  return DEFAULT;

  /** 用于空格缩进的原逻辑 */
  function detectSpaceIndentSize(indents: number[]): number {
    if (indents.length === 0) return DEFAULT.size;
    const freq: Record<number, number> = {};
    indents.forEach(n => (freq[n] = (freq[n] || 0) + 1));
    const unique = Object.keys(freq)
      .map(Number)
      .sort((a, b) => a - b);

    if (unique.length === 1 && freq[unique[0]] >= MIN_SAMPLES && unique[0] <= COMMON_MAX) return unique[0];

    const gcd = (a: number, b: number): number => {
      a = Math.abs(a);
      b = Math.abs(b);
      while (b) [a, b] = [b, a % b];
      return a;
    };

    let gLen = unique[0];
    for (let i = 1; i < unique.length; i++) gLen = gcd(gLen, unique[i]);
    const coverLen = (step: number) => indents.filter(n => n % step === 0).length / indents.length;

    if (gLen >= 2 && gLen <= COMMON_MAX && coverLen(gLen) >= RELIABLE_COVER) return gLen;

    if (gLen > COMMON_MAX) {
      for (let d = 2; d <= COMMON_MAX; d++) {
        if (gLen % d === 0 && coverLen(d) >= RELIABLE_COVER) return d;
      }
    }

    const diffs: number[] = [];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) diffs.push(unique[j] - unique[i]);
    }

    if (diffs.length) {
      let gDiff = diffs[0];
      for (let i = 1; i < diffs.length; i++) gDiff = gcd(gDiff, diffs[i]);
      const coverDiff = (step: number) => diffs.filter(d => d % step === 0).length / diffs.length;
      if (gDiff >= 2 && gDiff <= COMMON_MAX && coverDiff(gDiff) >= RELIABLE_COVER) return gDiff;
    }

    let best = DEFAULT.size;
    let bestScore = -1;
    for (let k = 2; k <= COMMON_MAX; k++) {
      const score = indents.filter(n => n % k === 0).length;
      if (score > bestScore || (score === bestScore && k < best)) {
        best = k;
        bestScore = score;
      }
    }
    if (bestScore / indents.length >= FALLBACK_COVER) return best;
    return DEFAULT.size;
  }
}
