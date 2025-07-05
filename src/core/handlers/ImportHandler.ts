import fs from "fs";
import xlsx from "node-xlsx";
import { ExcelData } from "@/types";
import { LangContextInternal } from "@/types";
import { getLangIntro } from "@/utils/langKey";
import { getDetectedLangList, setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import { RewriteHandler } from "./RewriteHandler";
import { t } from "@/utils/i18n";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";

export class ImportHandler {
  constructor(private ctx: LangContextInternal) {}

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public async run(): Promise<ExecutionResult> {
    try {
      if (!fs.existsSync(this.ctx.importExcelFrom)) {
        return {
          success: false,
          message: t("command.import.wrongPath"),
          code: EXECUTION_RESULT_CODE.InvalidExportPath
        };
      }
      const excelData = xlsx.parse(this.ctx.importExcelFrom) as ExcelData;
      for (let sheetIndex = 0; sheetIndex < excelData.length; sheetIndex++) {
        const sheetData = excelData[sheetIndex].data;
        if (sheetData.length === 0) continue;
        const [headInfo] = sheetData.splice(0, 1);
        const headLen = headInfo.length;
        for (let i = 0; i <= headLen; i++) {
          if (typeof headInfo[i] === "string") {
            headInfo[i] = String(headInfo[i]).trim();
          } else {
            headInfo[i] = "NULL";
          }
        }
        const langNum = headInfo
          .map(item => getLangIntro(item as string)?.enName)
          .filter(item => item !== null && item !== undefined).length;
        if (langNum === 0) {
          return {
            success: false,
            message: t("command.import.noLang"),
            code: EXECUTION_RESULT_CODE.ImportNoLang
          };
        }
        const keyIndex = headInfo.findIndex(item => String(item).toLowerCase() === "key");
        if (keyIndex === -1) {
          return {
            success: false,
            message: t("command.import.noKey"),
            code: EXECUTION_RESULT_CODE.ImportNoKey
          };
        }
        sheetData.forEach(item => {
          let entryName = item[keyIndex] ?? "";
          entryName = entryName.toString().trim();
          if (entryName in this.ctx.langDictionary) {
            this.detectedLangList.forEach(lang => {
              const langIntro = getLangIntro(lang) || {};
              const langAlias = Object.values(langIntro);
              if (!langAlias.includes(lang)) {
                langAlias.push(lang);
              }
              const oldLangText = this.ctx.langDictionary[entryName][lang];
              const newLangText =
                item[
                  headInfo.findIndex(item => langAlias.some(alias => String(alias).toLowerCase() === String(item).toLowerCase()))
                ]?.toString() ?? "";
              if (newLangText.trim() && oldLangText !== newLangText) {
                setUpdatedEntryValueInfo(this.ctx, entryName, newLangText, lang);
              }
            });
          }
        });
      }
      if (this.ctx.rewriteFlag) {
        return await new RewriteHandler(this.ctx).run();
      }
      return { success: true, message: "", code: EXECUTION_RESULT_CODE.Success };
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownImportError };
    }
  }
}
