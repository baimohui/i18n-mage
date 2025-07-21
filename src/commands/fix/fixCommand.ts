import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import previewFixContent from "@/views/previewChanges";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";
import { ExecutionResult } from "@/types";

export function registerFixCommand() {
  const mage = LangMage.getInstance();
  const rewrite = async () => {
    mage.setOptions({ task: "rewrite", globalFlag: true, clearCache: false });
    const res = await mage.execute();
    mage.setOptions({ task: "check", globalFlag: true, clearCache: true });
    await mage.execute();
    treeInstance.refresh();
    return res;
  };
  const disposable = vscode.commands.registerCommand("i18nMage.fix", async () => {
    let res: ExecutionResult | null = null;
    await wrapWithProgress({ title: t("command.fix.progress"), cancellable: true, timeout: 1000 * 60 * 10 }, async () => {
      treeInstance.isSyncing = true;
      treeInstance.refresh();
      const rewriteFlag = !getConfig<boolean>("general.previewChanges", true);
      mage.setOptions({ task: "fix", globalFlag: true, rewriteFlag });
      res = await mage.execute();
      const publicCtx = mage.getPublicContext();
      const { updatedValues, patchedIds, countryMap } = mage.langDetail;
      if (res.success && [updatedValues, patchedIds].some(o => Object.keys(o).length > 0)) {
        if (rewriteFlag) {
          treeInstance.isSyncing = false;
          res = await rewrite();
          return;
        } else {
          if ([updatedValues, patchedIds].some(item => Object.keys(item).length > 0)) {
            previewFixContent(updatedValues, patchedIds, countryMap, publicCtx.referredLang, async () => {
              res = await rewrite();
            });
          }
        }
      }
      treeInstance.isSyncing = false;
      treeInstance.refresh();
    });
    setTimeout(() => {
      if (res !== null) NotificationManager.showResult(res);
    }, 1000);
  });

  registerDisposable(disposable);
}
