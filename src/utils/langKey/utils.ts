import * as vscode from "vscode";
import { LangKeyIntro } from "./types";
import { ApiPlatform } from "@/types";
import { resolveLangCode, resolveLangIntro } from "./core";
import { getCacheConfig } from "@/utils/config";

export function getLangIntro(str: string): LangKeyIntro | null {
  const customMappings = getCacheConfig<Record<string, string[]>>("translationServices.langAliasCustomMappings", {});
  return resolveLangIntro(str, customMappings);
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
  const customMappings = getCacheConfig<Record<string, string[]>>("translationServices.langAliasCustomMappings", {});
  return resolveLangCode(str, platform, customMappings);
}
