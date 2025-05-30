import { LangContextInternal } from "@/types";
import { printInfo, printTitle } from "@/utils/print";
import { getValueByAmbiguousEntryName } from "@/utils/regex";
import { setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import { RewriteHandler } from "./RewriteHandler";

export class ModifyHandler {
  constructor(private ctx: LangContextInternal) {}

  public run() {
    printTitle("修改词条");
    this.ctx.modifyList.forEach(item => {
      const { key, name, value, lang } = item;
      const entryKey = key || getValueByAmbiguousEntryName(this.ctx.entryTree, name);
      if (typeof entryKey === "string" && entryKey.trim() !== "") {
        setUpdatedEntryValueInfo(this.ctx, entryKey, value, lang);
      } else {
        printInfo("修改词条失败，未检测有效的词条名！", "error");
        return;
      }
    });
    if (this.ctx.rewriteFlag) {
      new RewriteHandler(this.ctx).run();
    }
  }
}
