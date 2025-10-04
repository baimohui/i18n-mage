import { LangContextInternal } from "@/types";
import { setValueByEscapedEntryName } from "@/utils/regex";

export function getDetectedLangList(ctx: LangContextInternal): string[] {
  return Object.keys(ctx.langCountryMap).filter(item => !ctx.ignoredLangs.includes(item));
}

export function setUpdatedEntryValueInfo(ctx: LangContextInternal, key: string, value: string | undefined, lang?: string): void {
  const langList = Object.keys(ctx.langCountryMap).filter(item => lang == null || item === lang);
  for (const l of langList) {
    ctx.updatedEntryValueInfo[l] ??= {};
    ctx.updatedEntryValueInfo[l][key] = value;
    if (typeof value === "string") {
      if (Object.hasOwn(ctx.langDictionary, key)) {
        ctx.langDictionary[key].value[l] = value;
      } else {
        ctx.langDictionary[key] = { fullPath: "", fileScope: "", value: { [l]: value } };
      }
      ctx.langCountryMap[l][key] = value;
      setValueByEscapedEntryName(ctx.entryTree, key, key);
    } else {
      delete ctx.langDictionary[key][l];
      delete ctx.langCountryMap[l][key];
      setValueByEscapedEntryName(ctx.entryTree, key, undefined);
    }
  }
}
