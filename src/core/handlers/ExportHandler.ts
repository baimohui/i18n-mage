import fs from "fs";
import xlsx from "node-xlsx";
import { printInfo, printTitle } from "@/utils/print";
import { LangContextInternal } from "@/types";
import { getDetectedLangList } from "@/core/tools/contextTools";
import { getLangText } from "@/utils/const";

export class ExportHandler {
  constructor(private ctx: LangContextInternal) {}

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public run() {
    printTitle("导出翻译");
    if (!this.ctx.exportExcelTo) {
      printInfo("导出文件路径不存在！", "brain");
      return;
    }
    const tableData = [["Label", ...this.detectedLangList.map(item => getLangText(item, "en") || item)]];
    for (const key in this.ctx.langDictionary) {
      const itemList = [key];
      const entryMap = this.ctx.langDictionary[key];
      this.detectedLangList.forEach(lang => {
        itemList.push(entryMap[lang]);
      });
      tableData.push(itemList);
    }
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
    fs.writeFileSync(this.ctx.exportExcelTo.replace(".xlsx", "New.xlsx"), buffer);
    printInfo(`翻译表格已导出到 ${this.ctx.exportExcelTo} 路径`, "rocket");
  }
}
