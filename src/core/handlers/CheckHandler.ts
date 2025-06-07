import { LangContextInternal } from "@/types";
import { getDetectedLangList } from "@/core/tools/contextTools";

export class CheckHandler {
  constructor(private ctx: LangContextInternal) {}

  public run() {
    this.detectedLangList.forEach(lang => {
      const translation = this.ctx.langCountryMap[lang];
      const missingTranslations: string[] = [];
      const nullTranslations: string[] = [];
      const pivotEntryList = this.ctx.syncBasedOnReferredEntries
        ? Object.keys(this.ctx.langCountryMap[this.ctx.referredLang])
        : Object.keys(this.ctx.langDictionary);
      pivotEntryList.forEach(key => {
        if (!Object.hasOwn(translation, key)) {
          missingTranslations.push(key);
        } else if (translation[key].trim() === "") {
          nullTranslations.push(key);
        }
      });
      this.ctx.lackInfo[lang] = missingTranslations;
      this.ctx.nullInfo[lang] = nullTranslations;

      const extraTranslations: string[] = [];
      if (this.ctx.syncBasedOnReferredEntries) {
        for (const key in translation) {
          if (!Object.keys(this.ctx.langCountryMap[this.ctx.referredLang]).includes(key)) {
            extraTranslations.push(key);
          }
        }
      }
      this.ctx.extraInfo[lang] = extraTranslations;
    });
  }
  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }
}
