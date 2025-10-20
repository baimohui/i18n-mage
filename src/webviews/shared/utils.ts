import { VSCodeAPI, WindowApi } from "./type";
import en from "@/locales/en.json";
import zhCN from "@/locales/zh-CN.json";

export function createNonce(): string {
  return Array.from(
    { length: 32 },
    () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]
  ).join("");
}

let _cachedVscodeApi: VSCodeAPI | null = null;

export function getVSCodeAPI() {
  if (_cachedVscodeApi) return _cachedVscodeApi;
  if (typeof window === "undefined") return null;
  if (typeof (window as { acquireVsCodeApi: () => VSCodeAPI }).acquireVsCodeApi !== "function") return null;

  try {
    _cachedVscodeApi = (window as { acquireVsCodeApi: () => VSCodeAPI }).acquireVsCodeApi();
    return _cachedVscodeApi;
  } catch (err) {
    console.error("Failed to acquire VS Code API:", err);
    // 不抛出，让调用方能处理 null
    return null;
  }
}

const locales: Record<string, Record<string, string>> = {
  en,
  "zh-CN": zhCN
};

// 简化的语言代码获取（浏览器环境）
function getLangCode(language: string): string {
  const langMap: Record<string, string> = {
    en: "en",
    "en-us": "en",
    "zh-cn": "zh-CN",
    zh: "zh-CN"
  };
  return langMap[language.toLowerCase()] || "en";
}

function format(str: string, args: unknown[]): string {
  return str.replace(/{(\d+)}/g, (_, index) => {
    const i = Number(index);
    const val = args[i];
    if (val === undefined || val === null) return `{${i}}`;
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      return String(val);
    }
    try {
      return JSON.stringify(val);
    } catch {
      return `{${i}}`;
    }
  });
}

export function t(key: string, ...args: unknown[]): string {
  // 在 webview 中，从全局变量获取语言设置，或使用默认值
  const webviewData = (window as unknown as WindowApi).webviewData ?? {};
  const language = webviewData.language || navigator.language || "en";
  const lang = getLangCode(language);
  const messages = locales[lang] ?? locales["en"];
  const template = messages[key] ?? key;
  return format(template, args);
}
