import fs from "fs";
import * as vscode from "vscode";
import { getLangCode } from "@/utils/langKey";
import { EntryTree, FileExtraInfo } from "@/types";
import { unescapeString } from "./stringUtils";

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
  if (filePath !== undefined) {
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
      res = /^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~\s]*$/.test(str) && !isEnglishVariable(str);
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
      res = /[a-zA-ZÀ-ỹĀ-ỹăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(str);
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
    indentSize = 2,
    nestedLevel = 1,
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
  const indents = " ".repeat(indentSize);
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
  const formattedObj = formatObject(tree, nestedLevel);
  if (formattedObj) {
    output.push(formattedObj);
  }
  output.push(suffix ? `}${suffix}` : "}");
  return output.join(lineEnding);
}

export function formatForFile(str: string, doubleQuotes = true): string {
  if (doubleQuotes) {
    return '"' + str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + '"';
  } else {
    return "'" + str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + "'";
  }
}

export function isEnglishVariable(str: string): boolean {
  if (!str?.trim()) return false;
  const isLikelyVariable = /^[a-zA-Z_][\w.-{}]*$/.test(str) && !/\s/.test(str) && !/[.!?]$/.test(str);
  if (!isLikelyVariable) return false;
  return /[_\-.]/.test(str) || /[a-z][A-Z]|[A-Z][a-z]/.test(str) || (str === str.toUpperCase() && str.length > 1) || /\d/.test(str);
}
