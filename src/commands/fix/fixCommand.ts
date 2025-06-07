import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { PluginConfiguration } from "@/types";
import previewFixContent from "@/views/previewBeforeFix";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";

export function registerFixCommand() {
  const mage = LangMage.getInstance();
  const config = vscode.workspace.getConfiguration("i18n-mage") as PluginConfiguration;
  const disposable = vscode.commands.registerCommand("i18nMage.fix", async () => {
    await wrapWithProgress({ title: t("command.fix.progress") }, async () => {
      const rewriteFlag = !config.previewBeforeFix;
      mage.setOptions({ task: "fix", globalFlag: true, rewriteFlag });
      const success = await mage.execute();
      if (success) {
        if (rewriteFlag) {
          mage.setOptions({ task: "rewrite", globalFlag: true, clearCache: false, ignoredFileList: config.ignoredFileList });
          await mage.execute();
          mage.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
          await mage.execute();
          vscode.window.showInformationMessage("Fix success");
        } else {
          const publicCtx = mage.getPublicContext();
          const { updatedValues, patchedIds, countryMap } = mage.langDetail;
          if ([updatedValues, patchedIds].some(item => Object.keys(item).length > 0)) {
            previewFixContent(updatedValues, patchedIds, countryMap, publicCtx.referredLang, async () => {
              mage.setOptions({ task: "rewrite", clearCache: false });
              await mage.execute();
              mage.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
              await mage.execute();
              treeInstance.refresh();
              vscode.window.showInformationMessage(t("command.fix.success"));
            });
          } else {
            vscode.window.showWarningMessage(t("command.fix.nullWarn"));
          }
        }
      }
    });
  });

  registerDisposable(disposable);
}
