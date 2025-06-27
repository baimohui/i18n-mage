import fs from "fs";
import * as vscode from "vscode";
import { getLangCode } from "@/utils/langKey";
import { EntryTree, EntryMap, FileExtraInfo } from "@/types";
import { unescapeString } from "./stringUtils";

/**
 * 获取当前编辑器最准确的换行符
 * 判断优先级：1. 当前文档实际使用的换行符 > 2. 用户配置的换行符 > 3. 系统默认换行符
 * @returns '\n' (LF) 或 '\r\n' (CRLF)
 */
export function getLineEnding(filePath?: string): string {
  const activeDocEol = getDocumentEol(filePath);
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
function getDocumentEol(filePath?: string): string | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor || filePath === undefined) {
    return null;
  }
  // 方式 A：通过 document.eol 属性
  if (!filePath) {
    if (editor.document.eol === vscode.EndOfLine.CRLF) {
      return "\r\n";
    } else if (editor.document.eol === vscode.EndOfLine.LF) {
      return "\n";
    }
  }
  // 方式 B：通过内容检测（更可靠，特别是新建文件时）
  const text = filePath ? fs.readFileSync(filePath, "utf8") : editor.document.getText();
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

export function formatObjectToString(tree: EntryTree, lookup: EntryMap, filePath: string, extraInfo: FileExtraInfo): string {
  const { prefix = "", suffix = "", innerVar = "", indents = "  ", keyQuotes = true } = extraInfo;
  const match = filePath.match(/^.*\.([^.]+)$/);
  const fileType = match ? match[1] : "";
  function needsQuotes(key: string): boolean {
    const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    return !validIdentifier.test(key);
  }
  const lineEnding = getLineEnding(filePath);
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
