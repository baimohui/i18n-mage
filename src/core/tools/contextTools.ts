import { LangContextInternal } from "@/types";

export function getDetectedLangList(ctx: LangContextInternal): string[] {
  return Object.keys(ctx.langCountryMap).filter(item => !ctx.ignoredLangs.includes(item));
}

export function setUpdatedEntryValueInfo(ctx: LangContextInternal, name: string, value: string | undefined, lang?: string): void {
  const langList = Object.keys(ctx.langCountryMap).filter(item => lang == null || item === lang);
  for (const l of langList) {
    ctx.updatedEntryValueInfo[l] ??= {};
    ctx.updatedEntryValueInfo[l][name] = value;
  }
}
