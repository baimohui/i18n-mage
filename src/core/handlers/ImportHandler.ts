import fs from "fs";
import xlsx from "node-xlsx";
import { ExcelData } from "@/types";
import { LangContextInternal } from "@/types";
import { getLangIntro, getLangText } from "@/utils/langKey";
import { getDetectedLangList, setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import { t } from "@/utils/i18n";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";
import { NotificationManager } from "@/utils/notification";

export class ImportHandler {
  constructor(private ctx: LangContextInternal) {}

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public run(): ExecutionResult {
    try {
      NotificationManager.logToOutput(t("command.import.pathDetected", this.ctx.importExcelFrom));
      if (!fs.existsSync(this.ctx.importExcelFrom)) {
        return {
          success: false,
          message: t("command.import.wrongPath"),
          code: EXECUTION_RESULT_CODE.InvalidExportPath
        };
      }
      const excelData = xlsx.parse(this.ctx.importExcelFrom) as ExcelData;
      for (let sheetIndex = 0; sheetIndex < excelData.length; sheetIndex++) {
        NotificationManager.logToOutput(t("command.import.sheetIndex", sheetIndex + 1));
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
        const langColumns = headInfo.map(item => getLangText(item as string, "en")).filter(item => item !== "");
        NotificationManager.logToOutput(t("command.import.langDetected", langColumns.join(", ") || t("common.none")));
        if (langColumns.length === 0) {
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
          let key = item[keyIndex] ?? "";
          key = key.toString().trim();
          if (key in this.ctx.langDictionary) {
            this.detectedLangList.forEach(lang => {
              const langIntro = getLangIntro(lang) || {};
              const langAlias = Object.values(langIntro);
              if (!langAlias.includes(lang)) {
                langAlias.push(lang);
              }
              const oldLangText = this.ctx.langDictionary[key].value[lang];
              const newLangText =
                item[
                  headInfo.findIndex(item => langAlias.some(alias => String(alias).toLowerCase() === String(item).toLowerCase()))
                ]?.toString() ?? "";
              if (newLangText.trim() && oldLangText !== newLangText) {
                setUpdatedEntryValueInfo(this.ctx, key, newLangText, lang);
                this.ctx.updatePayloads.push({
                  type: "edit",
                  key,
                  changes: {
                    [lang]: { before: oldLangText, after: newLangText }
                  }
                });
              }
            });
          }
        });
      }
      return { success: true, message: "", code: EXECUTION_RESULT_CODE.Success };
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownImportError };
    }
  }
}
