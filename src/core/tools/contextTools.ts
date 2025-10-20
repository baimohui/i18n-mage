import { LangContextInternal } from "@/types";

export function getDetectedLangList(ctx: LangContextInternal): string[] {
  return Object.keys(ctx.langCountryMap).filter(item => !ctx.ignoredLangs.includes(item));
}
