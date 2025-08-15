import fs from "fs";
import xlsx from "node-xlsx";
import { LangContextInternal } from "@/types";
import { getDetectedLangList } from "@/core/tools/contextTools";
import { getLangText } from "@/utils/langKey";
import { t } from "@/utils/i18n";
import { SortHandler } from "./SortHandler";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";
import { NotificationManager } from "@/utils/notification";

export class ExportHandler {
  constructor(private ctx: LangContextInternal) {}

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public run(): ExecutionResult {
    try {
      NotificationManager.logToOutput(t("command.export.pathDetected", this.ctx.exportExcelTo));
      if (!this.ctx.exportExcelTo) {
        return {
          success: false,
          message: t("command.export.error", t("command.export.wrongPath")),
          code: EXECUTION_RESULT_CODE.InvalidExportPath
        };
      }
      const tableData = [["Key", ...this.detectedLangList.map(item => getLangText(item, "en") || item)]];
      const sortedKeys = new SortHandler(this.ctx).getSortedKeys(this.ctx.sortingExportMode, this.ctx.referredLang);
      const keys = sortedKeys.length > 0 ? sortedKeys : Object.keys(this.ctx.langDictionary);
      keys.forEach(key => {
        const itemList = [key];
        const entryMap = this.ctx.langDictionary[key];
        this.detectedLangList.forEach(lang => {
          itemList.push(entryMap[lang]);
        });
        tableData.push(itemList);
      });
      const sheetOptions = {
        "!cols": [
          { wch: 24 },
          ...Array.from({ length: this.detectedLangList.length }, () => ({
            wch: 48
          }))
        ]
      };
      const buffer = xlsx.build([{ name: "Sheet1", data: tableData, options: {} }], { sheetOptions });
      // TODO 非管理员模式创建表格会失败
      fs.writeFileSync(this.ctx.exportExcelTo, buffer);
      fs.writeFileSync(this.ctx.exportExcelTo.replace(".xlsx", ".xlsx"), buffer);
      fs.writeFileSync(this.ctx.exportExcelTo.replace(".xlsx", "New.xlsx"), buffer);
      return { success: true, message: "", code: EXECUTION_RESULT_CODE.Success };
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownExportError };
    }
  }
}
