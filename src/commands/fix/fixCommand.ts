import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import previewFixContent from "@/views/previewChanges";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";
import { getCommonFilePaths } from "@/utils/regex";
import { EXECUTION_RESULT_CODE } from "@/types";

export function registerFixCommand(context: vscode.ExtensionContext) {
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
    const publicCtx = mage.getPublicContext();
    if (publicCtx.autoTranslateMissingKey) {
      await wrapWithProgress({ title: t("command.fix.progress"), cancellable: true, timeout: 1000 * 60 * 10 }, async () => {
        await mage.execute({ task: "check" });
        const { multiFileMode, undefined: undefinedMap } = mage.langDetail;
        if (Object.keys(undefinedMap).length > 0 && multiFileMode && publicCtx.fileStructure) {
          const commonFiles = getCommonFilePaths(publicCtx.fileStructure);
          const lastPicked = context.globalState.get<string>("lastPickedFile");
          const sortedFiles = lastPicked !== undefined ? [lastPicked, ...commonFiles.filter(f => f !== lastPicked)] : commonFiles;
          const target = await vscode.window.showQuickPick(sortedFiles, {
            placeHolder: t("command.fix.selectFileToWrite")
          });
          if (typeof target === "string" && target.trim()) {
            mage.setOptions({ defaultFilePos: `${target.replaceAll("/", ".")}.` });
            await context.globalState.update("lastPickedFile", target);
          } else {
            return;
          }
        }
      });
    }
    await wrapWithProgress({ title: t("command.fix.progress"), cancellable: true, timeout: 1000 * 60 * 10 }, async (_, token) => {
      treeInstance.isSyncing = true;
      treeInstance.refresh();
      const previewChanges = getConfig<boolean>("general.previewChanges", true);
      const res = await mage.execute({ task: "fix" });
      if (token.isCancellationRequested) {
        treeInstance.isSyncing = false;
        treeInstance.refresh();
        NotificationManager.showResult({ success: false, message: "", code: EXECUTION_RESULT_CODE.Cancelled });
        return;
      }
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
