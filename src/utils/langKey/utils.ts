import * as vscode from "vscode";
import { LangKey, LangKeyIntro } from "./types";
import { ApiPlatform } from "@/types";
import { LANG_CODE_MAPPINGS, DEFAULT_LANG_ALIAS_MAP } from "./constants";
import { getCacheConfig } from "@/utils/config";

const REVERSE_MAP = new Map<string, LangKey>();
const LANG_CODES = new Set<string>();

Object.keys(LANG_CODE_MAPPINGS).forEach(key => LANG_CODES.add(key));

Object.entries(LANG_CODE_MAPPINGS).forEach(([key, intro]) => {
  const add = (value: string) => {
    REVERSE_MAP.set(standardizeName(value), key as LangKey);
  };

  add(key);

  Object.values(intro)
    .filter(Boolean)
    .forEach(code => add(code));
});

function buildAutoAliasMap(): Record<string, string[]> {
  const autoAliasMap: Record<string, string[]> = {};

  for (const [key, intro] of Object.entries(LANG_CODE_MAPPINGS)) {
    const aliasSet = new Set<string>();

    const addAlias = (alias: string) => {
      const normalized = standardizeName(alias);
      if (!normalized) return;
      aliasSet.add(normalized);
      if (normalized.includes("-")) {
        aliasSet.add(normalized.replace(/-/g, "_"));
      }
    };

    // Keep every language resolvable by its canonical key and platform codes.
    addAlias(key);
    addAlias(key.replace(/-/g, "_"));
    Object.values(intro)
      .filter(Boolean)
      .forEach(code => addAlias(code));

    autoAliasMap[key] = [...aliasSet];
  }

  return autoAliasMap;
}

function getMergedLangMap(): Record<string, string[]> {
  const mergedMap = buildAutoAliasMap();

  // Curated built-ins override/extend auto aliases.
  for (const [lang, aliases] of Object.entries(DEFAULT_LANG_ALIAS_MAP)) {
    mergedMap[lang] = [...new Set([...(mergedMap[lang] ?? []), ...aliases])];
  }

  return mergedMap;
}

export function getLangIntro(str: string): LangKeyIntro | null {
  const splitString = (inputStr: string) => {
    const matches = inputStr.toLowerCase().match(/[a-z0-9-]+/g);
    if (matches && matches.length) {
      return matches.length > 1 ? matches : [...matches, matches.join("")];
    } else {
      return [];
    }
  };

  const mergedLangMap = getMergedLangMap();
  Object.entries(mergedLangMap).forEach(([key, aliases]) => {
    aliases.forEach(alias => {
      const normalized = standardizeName(alias);
      REVERSE_MAP.set(normalized, key as LangKey);
    });
  });

  // User custom mappings are applied last so they always have the highest priority.
  const customMappings = getCacheConfig<Record<string, string[]>>("translationServices.langAliasCustomMappings", {});
  for (const [lang, aliases] of Object.entries(customMappings)) {
    const langToLowerCase = lang.toLowerCase();
    if (!Object.hasOwn(LANG_CODE_MAPPINGS, langToLowerCase)) continue;
    aliases.forEach(alias => {
      const normalized = standardizeName(alias);
      REVERSE_MAP.set(normalized, langToLowerCase as LangKey);
    });
  }

  const baseName = standardizeName(str);
  const splittedNameList = splitString(baseName);

  if (REVERSE_MAP.has(baseName)) {
    const mainKey = REVERSE_MAP.get(baseName)!;
    return LANG_CODE_MAPPINGS[mainKey] ?? null;
  }

  for (const splittedName of splittedNameList) {
    if (LANG_CODES.has(splittedName)) {
      return LANG_CODE_MAPPINGS[splittedName as LangKey] ?? null;
    }

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

    if (/\d+$/.test(splittedName)) {
      const langPartWithNumber = splittedName.split("-").find(part => !/^\d+$/.test(part));
      if (langPartWithNumber !== undefined && REVERSE_MAP.has(langPartWithNumber)) {
        const mainKey = REVERSE_MAP.get(langPartWithNumber)!;
        return LANG_CODE_MAPPINGS[mainKey] ?? null;
      }
    }
  }

  return LANG_CODE_MAPPINGS[baseName as LangKey] ?? null;
}

export function getLangText(str: string, langCode: string = ""): string {
  const intro = getLangIntro(str) as LangKeyIntro;
  const isCn = getLangCode(langCode || vscode.env.language) === "zh-CN";
  if (isCn) {
    return intro?.cnName || "";
  } else {
    return intro?.enName || "";
  }
}

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
