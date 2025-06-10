import { CaseType } from "@/types";

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

export function getPathSegsFromId(id: string): string[] {
  // 1. 用正则一次性按“\\.”（转义点）或者 非“.”字符的连续串 拆分
  const rawSegs = id.match(/(\\\.|[^.])+/g);
  if (!rawSegs) return [];
  // 2. 把每段里的 "\." 恢复成真正的 "."
  return rawSegs.map(seg => seg.replace(/\\\./g, "."));
}
