import { LangContextInternal } from "@/types";
import { getValueByAmbiguousEntryName } from "@/utils/regex";
import { setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import { RewriteHandler } from "./RewriteHandler";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export class ModifyHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run() {
    NotificationManager.showTitle(t("command.modify.title"));
    this.ctx.modifyList.forEach(item => {
      const { key, name, value, lang } = item;
      const entryKey = key || getValueByAmbiguousEntryName(this.ctx.entryTree, name);
      if (typeof entryKey === "string" && entryKey.trim() !== "") {
        setUpdatedEntryValueInfo(this.ctx, entryKey, value, lang);
      } else {
        NotificationManager.showError(t("command.modify.error"));
        return;
      }
    });
    if (this.ctx.rewriteFlag) {
      await new RewriteHandler(this.ctx).run();
    }
  }
}
