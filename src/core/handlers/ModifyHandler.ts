import { FixExecutionResult, I18nUpdatePayload, LangContextInternal, ModifyQuery } from "@/types";
import { RewriteHandler } from "./RewriteHandler";
import { t } from "@/utils/i18n";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";
import translateTo from "@/translator/index";
import { getDetectedLangList } from "../tools/contextTools";
import { NotificationManager } from "@/utils/notification";
import { internalToDisplayName, unescapeString } from "@/utils/regex";
import { toRelativePath } from "@/utils/fs";

export class ModifyHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run(): Promise<ExecutionResult> {
    try {
      if (this.ctx.modifyQuery === null) {
        return { success: false, message: t("command.modify.error"), code: EXECUTION_RESULT_CODE.InvalidEntryName };
      }
      const type = this.ctx.modifyQuery.type;
      if (type === "editValue") {
        this.handleEditValue(this.ctx.modifyQuery);
      } else if (type === "renameKey") {
        this.handleRenameKey(this.ctx.modifyQuery);
      } else if (type === "rewriteEntry") {
        const res = await this.handleRewrite(this.ctx.modifyQuery);
        await new RewriteHandler(this.ctx).run();
        return res;
      }
      return await new RewriteHandler(this.ctx).run();
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownModifyError };
    }
  }

  private handleEditValue(query: ModifyQuery) {
    const { key, value, lang } = query;
    if (lang === undefined) return;
    this.ctx.updatePayloads.push({
      type: "edit",
      key,
      valueChanges: {
        [lang]: { before: this.ctx.langCountryMap[lang][key], after: value }
      }
    });
  }

  private async handleRewrite(query: ModifyQuery) {
    const { key, value } = query;
    const payload: I18nUpdatePayload = {
      type: "edit",
      key,
      valueChanges: {
        [this.ctx.referredLang]: { before: this.ctx.langCountryMap[this.ctx.referredLang][key], after: value }
      }
    };
    const steps = this.detectedLangList.length - 1;
    let successCount = 0;
    let failCount = 0;
    for (const lang of this.detectedLangList) {
      if (lang === this.ctx.referredLang) continue;
      const res = await translateTo({
        source: this.ctx.referredLang,
        target: lang,
        sourceTextList: [value]
      });
      if (res.success && res.data && payload.valueChanges) {
        successCount++;
        payload.valueChanges[lang] = { before: this.ctx.langCountryMap[lang][key], after: res.data[0] };
      } else {
        failCount++;
      }
      NotificationManager.showProgress({
        message: res.message,
        type: res.success ? "success" : "error",
        increment: (1 / steps) * 100
      });
    }
    let success = true;
    let message = "";
    let code = EXECUTION_RESULT_CODE.Success;
    if (failCount === 0) {
      message = t("command.fix.translatorSuccess", successCount, successCount);
      code = EXECUTION_RESULT_CODE.Success;
    } else if (successCount > 0) {
      message = t("command.fix.translatorPartialSuccess", successCount + failCount, successCount, successCount, failCount);
      code = EXECUTION_RESULT_CODE.TranslatorPartialFailed;
    } else {
      success = false;
      message = t("command.fix.translatorFailed", successCount + failCount);
      code = EXECUTION_RESULT_CODE.TranslatorFailed;
    }
    this.ctx.updatePayloads.push(payload);
    return new Promise<FixExecutionResult>(resolve => {
      setTimeout(() => {
        resolve({
          success,
          message,
          code,
          data: {
            success: successCount,
            failed: failCount,
            generated: successCount,
            total: successCount + failCount,
            patched: 0
          }
        });
      }, 1500);
    });
  }

  private handleRenameKey(query: ModifyQuery) {
    const { key, value } = query;
    const payload: I18nUpdatePayload = {
      type: "rename",
      key,
      keyChange: { before: key, after: value }
    };
    this.ctx.updatePayloads.push(payload);
    const name = unescapeString(key);
    if (Object.hasOwn(this.ctx.usedEntryMap, name)) {
      const displayName = internalToDisplayName(unescapeString(value));
      Object.entries(this.ctx.usedEntryMap[name]).forEach(([path, posSet]) => {
        const relativePath = toRelativePath(path);
        this.ctx.patchedEntryIdInfo[relativePath] ??= [];
        Array.from(posSet).forEach(pos => {
          this.ctx.patchedEntryIdInfo[relativePath].push({
            id: key,
            raw: key,
            fixedRaw: displayName,
            fixedKey: displayName,
            addedVars: "",
            pos
          });
        });
      });
    }
  }

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }
}
