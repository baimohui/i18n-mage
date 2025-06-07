import fs from "fs";
import xlsx from "node-xlsx";
import { ExcelData } from "@/types";
import { LangContextInternal } from "@/types";
import { getLangIntro } from "@/utils/const";
import { getDetectedLangList, setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import { RewriteHandler } from "./RewriteHandler";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export class ImportHandler {
  constructor(private ctx: LangContextInternal) {}

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public async run() {
    NotificationManager.showTitle(t("command.import.title"));
    if (!fs.existsSync(this.ctx.importExcelFrom)) {
      NotificationManager.showError(t("command.import.wrongPath"));
      return;
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
      NotificationManager.showSuccess(
        t(
          "command.import.langDetected",
          headInfo
            .map(item => getLangIntro(item as string)?.enName)
            .filter(item => item !== null && item !== undefined)
            .join(", ") || t("common.none")
        )
      );
      const labelIndex = headInfo.findIndex(item => String(item).toLowerCase() === "label");
      sheetData.forEach(item => {
        let entryName = item[labelIndex] ?? "";
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
      await new RewriteHandler(this.ctx).run();
    }
  }
}
