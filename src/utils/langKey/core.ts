import { ApiPlatform } from "@/types";
import { DEFAULT_LANG_ALIAS_MAP, LANG_CODE_MAPPINGS } from "./constants";
import { LangKey, LangKeyIntro } from "./types";

export type LangAliasCustomMappings = Record<string, string[]>;

const LANG_CODES = new Set<string>(Object.keys(LANG_CODE_MAPPINGS));

function standardizeName(str: string): string {
  return str.toLowerCase().replace(/_/g, "-");
}

function splitString(inputStr: string): string[] {
  const matches = inputStr.toLowerCase().match(/[a-z0-9-]+/g);
  if (matches && matches.length) {
    return matches.length > 1 ? matches : [...matches, matches.join("")];
  }
  return [];
}

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

    addAlias(key);
    addAlias(key.replace(/-/g, "_"));
    Object.values(intro)
      .filter(Boolean)
      .forEach(code => addAlias(code));

    autoAliasMap[key] = [...aliasSet];
  }

  return autoAliasMap;
}

function buildMergedLangMap(customMappings: LangAliasCustomMappings = {}): Record<string, string[]> {
  const mergedMap = buildAutoAliasMap();

  for (const [lang, aliases] of Object.entries(DEFAULT_LANG_ALIAS_MAP)) {
    mergedMap[lang] = [...new Set([...(mergedMap[lang] ?? []), ...aliases])];
  }

  for (const [lang, aliases] of Object.entries(customMappings)) {
    const langToLowerCase = lang.toLowerCase();
    if (!Object.hasOwn(LANG_CODE_MAPPINGS, langToLowerCase)) continue;
    mergedMap[langToLowerCase] = [...new Set([...(mergedMap[langToLowerCase] ?? []), ...aliases])];
  }

  return mergedMap;
}

function createReverseMap(customMappings: LangAliasCustomMappings = {}): Map<string, LangKey> {
  const reverseMap = new Map<string, LangKey>();

  Object.entries(buildMergedLangMap(customMappings)).forEach(([key, aliases]) => {
    aliases.forEach(alias => {
      const normalized = standardizeName(alias);
      reverseMap.set(normalized, key as LangKey);
    });
  });

  return reverseMap;
}

export function resolveLangIntro(str: string, customMappings: LangAliasCustomMappings = {}): LangKeyIntro | null {
  const reverseMap = createReverseMap(customMappings);
  const baseName = standardizeName(str);
  const splittedNameList = splitString(baseName);

  if (reverseMap.has(baseName)) {
    const mainKey = reverseMap.get(baseName)!;
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
      if (reverseMap.has(langPart)) {
        const mainKey = reverseMap.get(langPart)!;
        return LANG_CODE_MAPPINGS[mainKey] ?? null;
      }
    }

    if (/\d+$/.test(splittedName)) {
      const langPartWithNumber = splittedName.split("-").find(part => !/^\d+$/.test(part));
      if (langPartWithNumber !== undefined && reverseMap.has(langPartWithNumber)) {
        const mainKey = reverseMap.get(langPartWithNumber)!;
        return LANG_CODE_MAPPINGS[mainKey] ?? null;
      }
    }
  }

  return LANG_CODE_MAPPINGS[baseName as LangKey] ?? null;
}

export function resolveLangCode(
  str: string,
  platform: ApiPlatform = "google",
  customMappings: LangAliasCustomMappings = {}
): string | null {
  const intro = resolveLangIntro(str, customMappings);
  const map: Record<ApiPlatform, keyof LangKeyIntro> = {
    google: "ggCode",
    tencent: "tcCode",
    baidu: "bdCode",
    deepseek: "ggCode",
    deepl: "dlCode",
    chatgpt: "ggCode",
    youdao: "ydCode"
  };
  return intro?.[map[platform]] ?? null;
}
