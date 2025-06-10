import fs from "fs";
import xlsx from "node-xlsx";
import { LangContextInternal } from "@/types";
import { getDetectedLangList } from "@/core/tools/contextTools";
import { getLangText } from "@/utils/langKey";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export class ExportHandler {
  constructor(private ctx: LangContextInternal) {}

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public run() {
    NotificationManager.showTitle(t("command.export.title"));
    if (!this.ctx.exportExcelTo) {
      NotificationManager.showTitle(t("command.export.error", t("command.export.wrongPath")));
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
  }
}
