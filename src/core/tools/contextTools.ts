import { LangContextInternal } from "@/types";

export function getDetectedLangList(ctx: LangContextInternal): string[] {
  const keys = Object.keys(ctx.langCountryMap);
  return keys.sort((a, b) => ctx.includedLangList.indexOf(a) - ctx.includedLangList.indexOf(b));
}

export function setUpdatedEntryValueInfo(ctx: LangContextInternal, name: string, value: string | undefined, lang?: string): void {
  const langList = Object.keys(ctx.langCountryMap).filter(item => lang == null || item === lang);
  for (const l of langList) {
    ctx.updatedEntryValueInfo[l] ??= {};
    ctx.updatedEntryValueInfo[l][name] = value;
  }
}
