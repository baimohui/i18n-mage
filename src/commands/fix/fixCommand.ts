import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import previewFixContent from "@/views/previewChanges";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";

export function registerFixCommand() {
  const mage = LangMage.getInstance();
  const rewrite = async () => {
    const res = await mage.execute({ task: "rewrite" });
    await mage.execute({ task: "check" });
    setTimeout(() => {
      treeInstance.isSyncing = false;
      treeInstance.refresh();
      NotificationManager.showResult(res, t("command.rewrite.success"));
    }, 1000);
  };
  const disposable = vscode.commands.registerCommand("i18nMage.fix", async () => {
    await wrapWithProgress({ title: t("command.fix.progress"), cancellable: true, timeout: 1000 * 60 * 10 }, async () => {
      await mage.execute({ task: "check" });
      treeInstance.isSyncing = true;
      treeInstance.refresh();
      const previewChanges = getConfig<boolean>("general.previewChanges", true);
      const res = await mage.execute({ task: "fix" });
      const publicCtx = mage.getPublicContext();
      const { updatedValues, patchedIds, countryMap } = mage.langDetail;
      if (res.success && [updatedValues, patchedIds].some(o => Object.keys(o).length > 0)) {
        if (previewChanges) {
          if ([updatedValues, patchedIds].some(item => Object.keys(item).length > 0)) {
            treeInstance.isSyncing = false;
            treeInstance.refresh();
            previewFixContent(updatedValues, patchedIds, countryMap, publicCtx.referredLang, async () => {
              await wrapWithProgress({ title: t("command.rewrite.progress") }, rewrite);
            });
          }
        } else {
          await rewrite();
        }
      } else {
        setTimeout(() => {
          treeInstance.isSyncing = false;
          treeInstance.refresh();
          if (res !== null) NotificationManager.showResult(res);
        }, 1000);
      }
    });
  });

  registerDisposable(disposable);
}
