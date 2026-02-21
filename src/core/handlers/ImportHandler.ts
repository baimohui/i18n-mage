import fs from "fs";
import { ExcelData, Cell } from "@/types";
import { LangContextInternal } from "@/types";
import { getLangIntro, getLangText } from "@/utils/langKey";
import { getDetectedLangList } from "@/core/tools/contextTools";
import { t } from "@/utils/i18n";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";
import { NotificationManager } from "@/utils/notification";
import { loadNodeXlsx } from "@/utils/lazyDeps";

export class ImportHandler {
  constructor(private ctx: LangContextInternal) {}

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public async run(): Promise<ExecutionResult> {
    try {
      NotificationManager.logToOutput(t("command.import.pathDetected", this.ctx.importExcelFrom));
      if (!fs.existsSync(this.ctx.importExcelFrom)) {
        return {
          success: false,
          message: t("command.import.wrongPath"),
          code: EXECUTION_RESULT_CODE.InvalidExportPath
        };
      }
      const importMode = this.ctx.importMode || "key";
      const xlsx = await loadNodeXlsx();
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
        if (importMode === "key") {
          this.importByKey(sheetData, headInfo, keyIndex);
        } else {
          this.importByLanguage(sheetData, headInfo);
        }
      }
      return { success: true, message: "", code: EXECUTION_RESULT_CODE.Success };
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownImportError };
    }
  }

  private importByKey(sheetData: Cell[][], headInfo: Cell[], keyIndex: number): void {
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
            this.ctx.updatePayloads.push({
              type: "edit",
              key,
              valueChanges: {
                [lang]: { before: oldLangText, after: newLangText }
              }
            });
          }
        });
      }
    });
  }

  private importByLanguage(sheetData: unknown[][], headInfo: Cell[]): void {
    const baselineLang = this.ctx.baselineLanguage;
    if (baselineLang === undefined) {
      return;
    }
    const baselineLangIntro = getLangIntro(baselineLang) || {};
    const baselineLangAlias = Object.values(baselineLangIntro);
    if (!baselineLangAlias.includes(baselineLang)) {
      baselineLangAlias.push(baselineLang);
    }
    const baselineLangIndex = headInfo.findIndex(item =>
      baselineLangAlias.some(alias => String(alias).toLowerCase() === String(item).toLowerCase())
    );
    if (baselineLangIndex === -1) {
      return;
    }
    sheetData.forEach(item => {
      const baselineText = item[baselineLangIndex]?.toString().trim() ?? "";
      if (!baselineText) {
        return;
      }
      for (const [key, entry] of Object.entries(this.ctx.langDictionary)) {
        if (entry.value[baselineLang] === baselineText) {
          this.detectedLangList.forEach(lang => {
            if (lang === baselineLang) {
              return;
            }
            const langIntro = getLangIntro(lang) || {};
            const langAlias = Object.values(langIntro);
            if (!langAlias.includes(lang)) {
              langAlias.push(lang);
            }
            const oldLangText = entry.value[lang];
            const newLangText =
              item[
                headInfo.findIndex(item => langAlias.some(alias => String(alias).toLowerCase() === String(item).toLowerCase()))
              ]?.toString() ?? "";
            if (newLangText.trim() && oldLangText !== newLangText) {
              this.ctx.updatePayloads.push({
                type: "edit",
                key,
                valueChanges: {
                  [lang]: { before: oldLangText, after: newLangText }
                }
              });
            }
          });
        }
      }
    });
  }
}
