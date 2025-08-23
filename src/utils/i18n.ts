import * as vscode from "vscode";
import en from "@/locales/en.json";
import zhCN from "@/locales/zh-CN.json";
import { getLangCode } from "./langKey";

const locales: Record<string, Record<string, string>> = {
  en,
  "zh-CN": zhCN
};

function format(str: string, args: unknown[]): string {
  return str.replace(/{(\d+)}/g, (_, index) => {
    const i = Number(index);
    const val = args[i];
    if (val === undefined || val === null) return `{${i}}`;
    // 安全类型处理
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      return String(val);
    }
    // 对象/数组等类型，转换成 JSON
    try {
      return JSON.stringify(val);
    } catch {
      return `{${i}}`; // 避免报错
    }
  });
}

export function t(key: string, ...args: unknown[]): string {
  const lang = getLangCode(vscode.env.language) ?? "";
  const messages = locales[lang] ?? locales["en"]; // 默认回退到英文
  const template = messages[key] ?? key; // fallback 避免 undefined
  return format(template, args);
}
