import * as vscode from "vscode";
import { LangKey, LangKeyIntro } from "./types";
import { ApiPlatform } from "@/types";
import { LANG_CODE_MAPPINGS, DEFAULT_LANG_ALIAS_MAP } from "./constants";
import { getCacheConfig } from "@/utils/config";

// 预处理：构建反向索引映射
const REVERSE_MAP = new Map<string, LangKey>();
const LANG_CODES = new Set<string>();

// 初始化标准代码集合
Object.keys(LANG_CODE_MAPPINGS).forEach(key => LANG_CODES.add(key));

// 构建反向映射（代码 -> 主键）
Object.entries(LANG_CODE_MAPPINGS).forEach(([key, intro]) => {
  Object.values(intro)
    .filter(Boolean)
    .map(code => standardizeName(code))
    .forEach(code => REVERSE_MAP.set(code, key as LangKey));
});

function getMergedLangMap(): Record<string, string[]> {
  const customMappings = getCacheConfig<Record<string, string[]>>("translationServices.langAliasCustomMappings", {});
  // 深拷贝默认配置
  const mergedMap = JSON.parse(JSON.stringify(DEFAULT_LANG_ALIAS_MAP)) as Record<string, string[]>;
  // 合并策略：用户配置覆盖默认值
  for (const [lang, aliases] of Object.entries(customMappings)) {
    const LangToLowerCase = lang.toLowerCase();
    mergedMap[LangToLowerCase] = [...(mergedMap[LangToLowerCase] ?? []), ...aliases];
  }
  return mergedMap;
}

// 根据多语言文件名 (不带后缀) 获取对应语种简介
export function getLangIntro(str: string): LangKeyIntro | null {
  const splitString = (inputStr: string) => {
    const matches = inputStr.toLowerCase().match(/[a-z0-9-]+/g);
    if (matches && matches.length) {
      return matches.length > 1 ? matches : [...matches, matches.join("")];
    } else {
      return [];
    }
  };
  // 构建别名映射（别名 -> 主键）
  const mergedLangMap = getMergedLangMap();
  Object.entries(mergedLangMap).forEach(([key, aliases]) => {
    aliases.forEach(alias => {
      const normalized = standardizeName(alias);
      REVERSE_MAP.set(normalized, key as LangKey);
    });
  });
  const baseName = standardizeName(str);
  const splittedNameList = splitString(baseName);

  // 匹配反向映射（代码 + 别名）
  if (REVERSE_MAP.has(baseName)) {
    const mainKey = REVERSE_MAP.get(baseName)!;
    return LANG_CODE_MAPPINGS[mainKey] ?? null;
  }
  for (const splittedName of splittedNameList) {
    // 精确匹配主键
    if (LANG_CODES.has(splittedName)) {
      return LANG_CODE_MAPPINGS[splittedName as LangKey] ?? null;
    }
    // 处理带区域码的情况（如 en-US -> en）
    const [langPart] = splittedName.split("-");
    if (langPart && langPart !== splittedName) {
      if (LANG_CODES.has(langPart)) {
        return LANG_CODE_MAPPINGS[langPart as LangKey] ?? null;
      }
      if (REVERSE_MAP.has(langPart)) {
        const mainKey = REVERSE_MAP.get(langPart)!;
        return LANG_CODE_MAPPINGS[mainKey] ?? null;
      }
    }
    // 处理数字区域码（如 es-419）
    if (/\d+$/.test(splittedName)) {
      const langPart = splittedName.split("-").find(part => !/^\d+$/.test(part));
      if (langPart !== undefined && REVERSE_MAP.has(langPart)) {
        const mainKey = REVERSE_MAP.get(langPart)!;
        return LANG_CODE_MAPPINGS[mainKey] ?? null;
      }
    }
  }
  // 最终尝试直接匹配（兼容非标准键名）
  return LANG_CODE_MAPPINGS[baseName as LangKey] ?? null;
}

// 根据多语言文件名获取对应语种名称
export function getLangText(str: string, langCode: string = ""): string {
  const intro = getLangIntro(str) as LangKeyIntro;
  const isCn = getLangCode(langCode || vscode.env.language) === "zh-CN";
  if (isCn) {
    return intro?.cnName || "";
  } else {
    return intro?.enName || "";
  }
}

// 根据多语言文件名和平台获取对应语种代码
export function getLangCode(str: string, platform: ApiPlatform = "google"): string | null {
  const intro = getLangIntro(str) as LangKeyIntro;
  const map: Record<string, keyof LangKeyIntro> = {
    google: "ggCode",
    tencent: "tcCode",
    baidu: "bdCode",
    deepseek: "ggCode",
    deepl: "dlCode",
    chatgpt: "ggCode",
    youdao: "ydCode"
  };
  return intro?.[map[platform]] || null;
}

function standardizeName(str: string): string {
  return str.toLowerCase().replace(/_/g, "-");
}
