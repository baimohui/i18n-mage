import fs from "fs";
import xlsx from "node-xlsx";
import { ExcelData } from "@/types";
import { LangContextInternal } from "@/types";
import { printInfo, printTitle } from "@/utils/print";
import { getLangText, getLangIntro } from "@/utils/const";
import { getDetectedLangList, setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import { RewriteHandler } from "./RewriteHandler";

export class ImportHandler {
  constructor(private ctx: LangContextInternal) {}

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public run() {
    printTitle("导入翻译");
    if (!fs.existsSync(this.ctx.importExcelFrom)) {
      printInfo("导入文件路径不存在！", "brain");
      return;
    }
    const excelData = xlsx.parse(this.ctx.importExcelFrom) as ExcelData;
    let isModified = false;
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
      printInfo(
        `检测到表格内有效的语言列为：${
          headInfo
            .map(item => getLangIntro(item as string)?.cnName)
            .filter(item => item !== null && item !== undefined)
            .join("、") || "无"
        }`,
        "brain"
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
              printInfo(
                `条目 ${entryName} ${getLangText(lang) || lang}更改：\x1b[31m${oldLangText}\x1b[0m -> \x1b[32m${newLangText}\x1b[0m`,
                "mage"
              );
              setUpdatedEntryValueInfo(this.ctx, entryName, newLangText, lang);
              isModified = true;
            }
          });
        }
      });
    }
    if (this.ctx.rewriteFlag) {
      new RewriteHandler(this.ctx).run();
    }
    if (!isModified) {
      printInfo("未检测到文案变动的条目", "success");
    }
  }
}
