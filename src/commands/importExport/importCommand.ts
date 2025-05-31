import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { PluginConfiguration } from "@/types";
import previewFixContent from "@/views/previewBeforeFix";
import { wrapWithProgress } from "@/utils/wrapWithProgress";

export function registerImportCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const config = vscode.workspace.getConfiguration("i18n-mage") as PluginConfiguration;
  const disposable = vscode.commands.registerCommand("i18nMage.import", async () => {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: "Select Excel file",
      filters: {
        "Excel files": ["xlsx", "xls"]
      }
    };
    const fileUri = await vscode.window.showOpenDialog(options);
    if (Array.isArray(fileUri) && fileUri.length > 0) {
      wrapWithProgress({
        title: "导入中...",
        callback: async () => {
          const rewriteFlag = !config.previewBeforeFix;
          const filePath = fileUri[0].fsPath;
          mage.setOptions({ task: "import", importExcelFrom: filePath, rewriteFlag });
          const success = await mage.execute();
          if (success) {
            if (rewriteFlag) {
              mage.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
              await mage.execute();
              vscode.window.showInformationMessage("Import success");
            } else {
              const publicCtx = mage.getPublicContext();
              const { updatedValues, patchedIds, countryMap } = mage.langDetail;
              if ([updatedValues, patchedIds].some(item => Object.keys(item).length > 0)) {
                previewFixContent(updatedValues, patchedIds, countryMap, publicCtx.referredLang, async () => {
                  mage.setOptions({ task: "rewrite" });
                  await mage.execute();
                  mage.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
                  await mage.execute();
                  treeInstance.refresh();
                  vscode.window.showInformationMessage("Import success");
                });
              } else {
                vscode.window.showWarningMessage("No updated entries found.");
              }
            }
          }
        }
      });
    }
  });

  context.subscriptions.push(disposable);
}
