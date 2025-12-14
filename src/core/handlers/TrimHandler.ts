import { LangContextInternal } from "@/types";
import { RewriteHandler } from "./RewriteHandler";
import { t } from "@/utils/i18n";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";

export class TrimHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run(): Promise<ExecutionResult> {
    try {
      if (this.ctx.trimKeyList.length > 0) {
        this.ctx.trimKeyList.forEach(key => {
          this.ctx.updatePayloads.push({
            type: "delete",
            key,
            valueChanges: Object.entries(this.ctx.langDictionary[key].value).reduce((acc, [lang, val]) => {
              if (val) {
                acc[lang] = { before: val };
              }
              return acc;
            }, {})
          });
        });
        return await new RewriteHandler(this.ctx).run();
      } else {
        return { success: true, message: t("command.trim.nullWarn"), code: EXECUTION_RESULT_CODE.NoTrimEntries };
      }
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownExportError };
    }
  }
}
