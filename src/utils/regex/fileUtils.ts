import fs from "fs";
import vm from "node:vm";
import path from "path";
import JSON5 from "json5";
import { escapeString } from "./stringUtils";
import { LangTree, FileExtraInfo, LangFileInfo, EntryNode, EntryMap, EntryTree, I18nFramework, I18N_FRAMEWORK, QuoteStyle } from "@/types";
import { isPathInsideDirectory, isSamePath, toRelativePath } from "../fs";
import { getCacheConfig } from "../config";
import { NotificationManager } from "../notification";
import { t } from "../i18n";

export function isValidI18nCallablePath(inputPath: string): boolean {
  const { ignoredFiles, ignoredDirectories, languagePath } = getCacheConfig();
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
    const { fileExtensions } = getCacheConfig();
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

/**
 * 估算文件的默认缩进空格数（只识别空格缩进；混用/Tab 将回退到默认值）
 * 算法要点：
 * 1) 使用缩进“差值”来推断单位，避免更深层倍数（如 4）压过真实单位（如 2）。
 * 2) 计算差值集合的 GCD；若 GCD 不可靠，则在 2..8 中选覆盖率最高者。
 * 3) 设置样本量与覆盖率阈值，混乱缩进或样本不足时回退默认值。
 */
export function detectIndentSize(fileContent: string): number {
  const lines = fileContent.split(/\r?\n/);
  const DEFAULT = 4;
  const MAX_STEP = 16; // 允许的最大缩进步长
  const MIN_SAMPLES = 5; // 最小样本量要求
  const RELIABLE_COVER = 0.8; // GCD 可靠覆盖率阈值
  const FALLBACK_COVER = 0.6; // 备用投票的最低覆盖率
  const spaceIndents: number[] = [];
  const diffs: number[] = [];
  // 收集仅由空格组成的缩进长度，并记录相邻有效行的缩进差
  let prevIndent: number | null = null;
  for (const raw of lines) {
    if (!raw || !raw.trim()) continue;
    if (/^\s*(\/\/|\/\*|\*)/.test(raw)) continue; // 跳过注释行（简化处理）
    const m = raw.match(/^(\s+)\S/);
    if (!m) continue;
    const ws = m[1];
    if (/\t/.test(ws)) continue; // 只分析空格缩进
    const indent = ws.length;
    if (indent > 0 && indent <= MAX_STEP) {
      spaceIndents.push(indent);
    }
    if (prevIndent !== null) {
      const d = Math.abs(indent - prevIndent);
      if (d > 0 && d <= MAX_STEP) diffs.push(d);
    }
    prevIndent = indent;
  }
  // 样本不足直接回退
  if (spaceIndents.length < MIN_SAMPLES && diffs.length < MIN_SAMPLES) {
    return DEFAULT;
  }
  // 使用“层级集合”的两两差，弱化深层倍数的偏置
  const levels = Array.from(new Set(spaceIndents)).sort((a, b) => a - b);
  for (let i = 0; i < levels.length; i++) {
    for (let j = i + 1; j < levels.length; j++) {
      const d = levels[j] - levels[i];
      if (d > 0 && d <= MAX_STEP) diffs.push(d);
    }
  }
  if (diffs.length === 0) return DEFAULT;
  // 计算 GCD
  const gcd = (a: number, b: number): number => {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a;
  };
  let g = diffs[0];
  for (let i = 1; i < diffs.length; i++) g = gcd(g, diffs[i]);
  // 覆盖率评估函数：有多少差值是候选步长的整数倍
  const coverage = (step: number) => diffs.filter(d => d % step === 0).length / diffs.length;
  // 先信任 GCD，但需通过合理性校验
  if (g >= 2 && g <= 8 && coverage(g) >= RELIABLE_COVER) {
    return g;
  }
  // 备用：在 2..8 中选择覆盖率最高且通过阈值的最小值
  let best = DEFAULT;
  let bestScore = -1;
  for (let k = 2; k <= 8; k++) {
    const score = diffs.filter(d => d % k === 0).length;
    if (score > bestScore || (score === bestScore && k < best)) {
      best = k;
      bestScore = score;
    }
  }
  if (bestScore / diffs.length >= FALLBACK_COVER) return best;
  return DEFAULT;
}
