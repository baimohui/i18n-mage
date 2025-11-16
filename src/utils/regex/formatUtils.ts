import fs from "fs";
import * as vscode from "vscode";
import { getLangCode } from "@/utils/langKey";
import { EntryTree, FileExtraInfo } from "@/types";
import { unescapeString } from "./stringUtils";
import { expandDotKeys, flattenNestedObj } from "./fileUtils";
import { getCacheConfig } from "../config";

/**
 * 获取当前编辑器最准确的换行符
 * 判断优先级：1. 当前文档实际使用的换行符 > 2. 用户配置的换行符 > 3. 系统默认换行符
 * @returns '\n' (LF) 或 '\r\n' (CRLF)
 */
export function getLineEnding(filePath?: string): string {
  const activeDocEol = getDocumentEol(filePath);
  if (activeDocEol !== null) {
    return activeDocEol;
  }
  const configuredEol = getConfiguredLineEnding();
  if (configuredEol !== null) {
    return configuredEol;
  }
  return getSystemDefaultEol();
}

/**
 * 获取活动文档实际使用的换行符
 */
function getDocumentEol(filePath?: string): string | null {
  let text = "";
  if (filePath !== undefined && fs.existsSync(filePath)) {
    text = fs.readFileSync(filePath, "utf8");
  } else {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    // 尝试直接读取 eol 属性
    const eol = editor.document.eol;
    if (eol === vscode.EndOfLine.CRLF) return "\r\n";
    if (eol === vscode.EndOfLine.LF) return "\n";
    text = editor.document.getText();
  }
  const crlfMatches = text.match(/\r\n/g);
  const lfMatches = text.match(/(?<!\r)\n/g);
  if (crlfMatches && lfMatches) {
    return crlfMatches.length > lfMatches.length ? "\r\n" : "\n";
  }
  if (crlfMatches) return "\r\n";
  if (lfMatches) return "\n";
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

export function validateLang(str: string, lang: string): boolean {
  let res = true;
  const code = getLangCode(lang, "google");
  switch (code) {
    case "zh-CN": // 中文（简体）
    case "zh-TW": // 中文（繁體）
      res = /[\u4E00-\u9FFF\uF900-\uFAFF]+/.test(str);
      break;
    case "en":
      res = /^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~\s]*$/.test(str);
      break;
    case "ru": // 俄语
      res = /[а-яА-ЯЁё]/.test(str);
      break;
    case "ja": // 日语
      res = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(str);
      break;
    case "ko": // 韩语
      res = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(str);
      break;
    case "ar": // 阿拉伯语
      res = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str);
      break;
    case "th": // 泰语
      res = /[\u0E00-\u0E7F]/.test(str);
      break;
    case "de": // 德语
    case "fr": // 法语
    case "es": // 西班牙语
    case "it": // 意大利语
    case "pt": // 葡萄牙语
      res = /[a-zA-ZÀ-ÿ0-9\s.,'"!?;:()[\]{}\-+*/&%$#@\\^<>|`~]/.test(str);
      break;
    case "hi": // 印地语
      res = /[\u0900-\u097F]/.test(str);
      break;
    case "vi": // 越南语
      res = /[a-zA-Zăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(str);
      break;
    default:
      res = true; // 未知语言默认通过
  }
  return res;
}

export function formatObjectToString(tree: EntryTree, filePath: string, extraInfo: FileExtraInfo): string {
  const {
    prefix = "",
    suffix = "",
    innerVar = "",
    indentType = "space",
    indentSize = 2,
    isFlat = true,
    keyQuotes = "double",
    valueQuotes = "double"
  } = extraInfo;
  const match = filePath.match(/^.*\.([^.]+)$/);
  const fileType = match ? match[1] : "";
  function needsQuotes(key: string): boolean {
    const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    return !validIdentifier.test(key);
  }
  const lineEnding = getLineEnding(filePath);
  const indent = indentType === "space" ? " " : "\t";
  const indents = indent.repeat(indentSize);
  function formatObject(obj: EntryTree, level = 1): string {
    const result: string[] = [];
    const currentIndent = indents.repeat(level);
    for (const [key, value] of Object.entries(obj)) {
      let keyStr = unescapeString(key);
      if (fileType === "json" || keyQuotes === "double") {
        keyStr = `"${keyStr}"`;
      } else if (keyQuotes === "single") {
        keyStr = `'${keyStr}'`;
      } else if (needsQuotes(key)) {
        keyStr = valueQuotes === "double" ? `"${keyStr}"` : `'${keyStr}'`;
      }
      if (typeof value === "string") {
        result.push(`${currentIndent}${keyStr}: ${formatForFile(value, fileType === "json" || valueQuotes === "double")}`);
      } else if (Array.isArray(value)) {
        result.push(`${currentIndent}${keyStr}: ${JSON.stringify(value)}`);
      } else if (Object.prototype.toString.call(value) === "[object Object]") {
        const nestedValue = formatObject(value, level + 1);
        if (nestedValue) {
          result.push(`${currentIndent}${keyStr}: {${lineEnding}${nestedValue}${lineEnding}${currentIndent}}`);
        }
      }
    }
    return result.join(`,${lineEnding}`);
  }

  const output: string[] = [];
  output.push(prefix ? `${prefix}{` : "{");
  if (fileType !== "json" && innerVar) {
    output.push(`${indents}${innerVar}`);
  }
  if (isFlat) {
    tree = flattenNestedObj(tree, true);
  } else if (!getCacheConfig<boolean>("writeRules.allowDotInNestedKey", true)) {
    tree = expandDotKeys(tree);
  }
  const formattedObj = formatObject(tree);
  if (formattedObj) {
    output.push(formattedObj);
  }
  output.push(suffix ? `}${suffix}` : "}");
  return output.join(lineEnding);
}

export function formatForFile(str: string, doubleQuotes = true): string {
  if (doubleQuotes) {
    return '"' + formatEscapeChar(str).replace(/"/g, '\\"') + '"';
  } else {
    return "'" + formatEscapeChar(str).replace(/'/g, "\\'") + "'";
  }
}

export function formatEscapeChar(str: string) {
  return str.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

export function unFormatEscapeChar(str: string) {
  return str.replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
}

export function isEnglishVariable(str: string): boolean {
  if (!str?.trim()) return false;
  // 基础字符约束
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(str) || /[.!?]\s*$/.test(str)) return false;
  // 忽略前导下划线
  const s = str.replace(/^_+/, "");
  // 常规形式
  const isSnake = /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/.test(s); // 支持大小写混合 snake_case
  const isKebab = /^[a-z]+(?:-[a-z0-9]+)+$/.test(s);
  const isDotCase = /^[a-z]+(?:\.[a-z0-9]+)+$/.test(s);
  const isCamel = /^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(s);
  const isPascal = /^(?:[A-Z][a-z0-9]*){2,}$/.test(s);
  const isScream = /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(s);
  const isAllCapsWithDigit = /^[A-Z0-9]+$/.test(s) && /\d/.test(s);
  // 全大写字母（如 PMF、CPU）不视为变量
  const isAllUpper = /^[A-Z]+$/.test(s);
  return !isAllUpper && (isSnake || isKebab || isDotCase || isCamel || isPascal || isScream || isAllCapsWithDigit);
}
