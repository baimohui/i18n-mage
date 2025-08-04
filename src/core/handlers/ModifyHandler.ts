import { LangContextInternal } from "@/types";
import { getValueByAmbiguousEntryName } from "@/utils/regex";
import { setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import { RewriteHandler } from "./RewriteHandler";
import { t } from "@/utils/i18n";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";

export class ModifyHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run(): Promise<ExecutionResult> {
    try {
      this.ctx.modifyList.forEach(item => {
        const { key, name, value, lang } = item;
        const entryKey = key || getValueByAmbiguousEntryName(this.ctx.entryTree, name);
        if (typeof entryKey === "string" && entryKey.trim() !== "") {
          setUpdatedEntryValueInfo(this.ctx, entryKey, value, lang);
        } else {
          return { success: false, message: t("command.modify.error"), code: EXECUTION_RESULT_CODE.InvalidEntryName };
        }
      });
      return await new RewriteHandler(this.ctx).run();
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownModifyError };
    }
  }
}
