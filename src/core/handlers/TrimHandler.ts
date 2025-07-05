import { LangContextInternal } from "@/types";
import { setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import { RewriteHandler } from "./RewriteHandler";
import { t } from "@/utils/i18n";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";

export class TrimHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run(): Promise<ExecutionResult> {
    try {
      if (this.ctx.trimKeyList.length > 0) {
        this.ctx.trimKeyList.forEach(name => {
          setUpdatedEntryValueInfo(this.ctx, name, undefined);
        });
        if (this.ctx.rewriteFlag) {
          return await new RewriteHandler(this.ctx).run();
        }
      } else {
        return { success: true, message: t("command.trim.nullWarn"), code: EXECUTION_RESULT_CODE.NoTrimEntries };
      }
      return { success: true, message: "", code: EXECUTION_RESULT_CODE.Success };
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownExportError };
    }
  }
}
