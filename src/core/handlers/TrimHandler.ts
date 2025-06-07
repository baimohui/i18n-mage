import { LangContextInternal } from "@/types";
import { setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import { RewriteHandler } from "./RewriteHandler";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export class TrimHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run() {
    NotificationManager.showTitle(t("command.trim.title"));
    if (this.ctx.trimKeyList.length > 0) {
      this.ctx.trimKeyList.forEach(name => {
        setUpdatedEntryValueInfo(this.ctx, name, undefined);
      });
      if (this.ctx.rewriteFlag) {
        await new RewriteHandler(this.ctx).run();
      }
    } else {
      NotificationManager.showWarning(t("command.trim.nullWarn"));
    }
  }
}
