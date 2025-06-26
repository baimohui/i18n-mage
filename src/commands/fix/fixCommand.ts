import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import previewFixContent from "@/views/previewBeforeFix";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";

export function registerFixCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.fix", async () => {
    await wrapWithProgress({ title: t("command.fix.progress"), cancellable: true }, async (progress, token) => {
      const rewriteFlag = !getConfig<boolean>("previewBeforeFix", true);
      mage.setOptions({ task: "fix", globalFlag: true, rewriteFlag });
      const success = await mage.execute();
      if (success) {
        if (token.isCancellationRequested) {
          return;
        }
        if (rewriteFlag) {
          mage.setOptions({ task: "rewrite", globalFlag: true, clearCache: false });
          await mage.execute();
          mage.setOptions({ task: "check", globalFlag: true, clearCache: true });
          await mage.execute();
          NotificationManager.showSuccess(t("command.fix.success"));
        } else {
          const publicCtx = mage.getPublicContext();
          const { updatedValues, patchedIds, countryMap } = mage.langDetail;
          if ([updatedValues, patchedIds].some(item => Object.keys(item).length > 0)) {
            previewFixContent(updatedValues, patchedIds, countryMap, publicCtx.referredLang, async () => {
              mage.setOptions({ task: "rewrite", clearCache: false });
              await mage.execute();
              mage.setOptions({ task: "check", globalFlag: true, clearCache: true });
              await mage.execute();
              treeInstance.refresh();
              NotificationManager.showSuccess(t("command.fix.success"));
            });
          } else {
            NotificationManager.showWarning(t("command.fix.nullWarn"));
          }
        }
      }
    });
  });

  registerDisposable(disposable);
}
