import fs from "fs";
import vm from "node:vm";
import path from "path";
import JSON5 from "json5";
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
  QuoteStyle,
  DirNode
} from "@/types";
import { isPathInsideDirectory, isSamePath, toRelativePath } from "../fs";
import { getCacheConfig } from "../config";
import { NotificationManager } from "../notification";
import { t } from "../i18n";

export function isValidI18nCallablePath(inputPath: string): boolean {
  const { ignoredFiles, ignoredDirectories, languagePath, fileExtensions } = getCacheConfig();
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
  fileStructure: DirNode; // 带 type 标记的文件树
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
        node.children[base] = { type: "file", ext };
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

/**
 * 估算文件的默认缩进空格数（仅识别空格缩进）
 * 方案：
 * 1) 采集所有以空格缩进的行的缩进长度（忽略包含 \t 的行）。
 * 2) 先对“缩进长度集合”求 GCD：扁平文件也能直接得到单位。
 * 3) 若 GCD 不可靠（=1 或 >8 且不可约到常见单位），再用“层级差值”的 GCD 及覆盖率投票兜底。
 * 4) 有样本量与覆盖率阈值，混乱时回退默认值。
 */
export function detectIndentSize(fileContent: string): number {
  const DEFAULT = 4;
  const MAX_INDENT = 64;
  const COMMON_MAX = 8;
  const MIN_SAMPLES = 3; // 放宽以照顾小而扁平的文件
  const RELIABLE_COVER = 0.8;
  const FALLBACK_COVER = 0.6;
  const lines = fileContent.split(/\r?\n/);
  // 收集仅含空格的缩进长度
  const indents: number[] = [];
  for (const raw of lines) {
    if (!raw || !raw.trim()) continue;
    if (/^\s*(\/\/|\/\*|\*)/.test(raw)) continue;
    const m = raw.match(/^(\s+)\S/);
    if (!m) continue;
    const ws = m[1];
    if (/\t/.test(ws)) continue; // 忽略含 Tab 的行（混缩场景回退）
    const n = ws.length;
    if (n > 0 && n <= MAX_INDENT) indents.push(n);
  }
  if (indents.length === 0) return DEFAULT;
  // 如果只有一种缩进且出现次数>=MIN_SAMPLES，且不超过常见上限，直接采用
  const freq: Record<number, number> = {};
  indents.forEach(n => (freq[n] = (freq[n] || 0) + 1));
  const unique = Object.keys(freq)
    .map(Number)
    .sort((a, b) => a - b);
  if (unique.length === 1 && freq[unique[0]] >= MIN_SAMPLES && unique[0] <= COMMON_MAX) {
    return unique[0];
  }
  // gcd 工具
  const gcd = (a: number, b: number): number => {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a;
  };
  // 1) 主信号：缩进长度的 GCD（不看频率）
  let gLen = unique[0];
  for (let i = 1; i < unique.length; i++) gLen = gcd(gLen, unique[i]);
  const coverLen = (step: number) => indents.filter(n => n % step === 0).length / indents.length;
  // 如果 GCD 在常见范围内且覆盖率高，直接返回
  if (gLen >= 2 && gLen <= COMMON_MAX && coverLen(gLen) >= RELIABLE_COVER) {
    return gLen;
  }
  // 如果 GCD > 8，尝试约到 2..8 中的最小因子（优先更小单位）
  if (gLen > COMMON_MAX) {
    for (let d = 2; d <= COMMON_MAX; d++) {
      if (gLen % d === 0 && coverLen(d) >= RELIABLE_COVER) return d;
    }
  }
  // 2) 备选信号：层级差值（用 unique 的两两差，弱化深层倍数偏置）
  const diffs: number[] = [];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      diffs.push(unique[j] - unique[i]);
    }
  }
  if (diffs.length) {
    let gDiff = diffs[0];
    for (let i = 1; i < diffs.length; i++) gDiff = gcd(gDiff, diffs[i]);

    const coverDiff = (step: number) => diffs.filter(d => d % step === 0).length / diffs.length;

    if (gDiff >= 2 && gDiff <= COMMON_MAX && coverDiff(gDiff) >= RELIABLE_COVER) {
      return gDiff;
    }
  }
  // 3) 最终兜底：在 2..8 中选覆盖率最高且过阈值的最小步长
  let best = DEFAULT;
  let bestScore = -1;
  for (let k = 2; k <= COMMON_MAX; k++) {
    const score = indents.filter(n => n % k === 0).length;
    if (score > bestScore || (score === bestScore && k < best)) {
      best = k;
      bestScore = score;
    }
  }
  if (bestScore / indents.length >= FALLBACK_COVER) return best;
  return DEFAULT;
}
