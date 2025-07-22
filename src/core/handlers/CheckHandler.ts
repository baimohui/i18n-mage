import { LangContextInternal } from "@/types";
import { getDetectedLangList } from "@/core/tools/contextTools";
import { t } from "@/utils/i18n";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";

export class CheckHandler {
  constructor(private ctx: LangContextInternal) {}

  public run(): ExecutionResult {
    try {
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
            if (!Object.hasOwn(this.ctx.langCountryMap[this.ctx.referredLang], key)) {
              extraTranslations.push(key);
            }
          }
        }
        this.ctx.extraInfo[lang] = extraTranslations;
      });
      return { success: true, message: "", code: EXECUTION_RESULT_CODE.Success };
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownCheckError };
    }
  }
  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }
}
