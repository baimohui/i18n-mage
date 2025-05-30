import { LangContextInternal } from "@/types";
import { printInfo, printTitle } from "@/utils/print";
import { setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import { RewriteHandler } from "./RewriteHandler";

export class TrimHandler {
  constructor(private ctx: LangContextInternal) {}

  public run() {
    printTitle("清理翻译条目");
    if (this.ctx.trimKeyList.length > 0) {
      this.ctx.trimKeyList.forEach(name => {
        setUpdatedEntryValueInfo(this.ctx, name, undefined);
      });
      if (this.ctx.rewriteFlag) {
        new RewriteHandler(this.ctx).run();
      }
    } else {
      printInfo("未检测到需要清理的翻译条目！", "success");
    }
  }
}
