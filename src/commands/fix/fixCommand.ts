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

export function registerFixCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const rewrite = async () => {
    const publicCtx = mage.getPublicContext();
    const res = await mage.execute({ task: publicCtx.sortAfterFix ? "sort" : "rewrite" });
    await mage.execute({ task: "check" });
    setTimeout(() => {
      treeInstance.isSyncing = false;
      treeInstance.refresh();
      res.defaultSuccessMessage = t("command.rewrite.success");
      NotificationManager.showResult(res);
    }, 1000);
  };

  const fix = async (fixAll: boolean = true) => {
    const publicCtx = mage.getPublicContext();
    await wrapWithProgress({ title: t("command.fix.progress"), cancellable: true, timeout: 1000 * 60 * 10 }, async (_, token) => {
      await mage.execute({ task: "check" });
      const { multiFileMode, undefined: undefinedMap } = mage.langDetail;
      if (publicCtx.autoTranslateMissingKey && Object.keys(undefinedMap).length > 0 && multiFileMode && publicCtx.fileStructure) {
        const commonFiles = getCommonFilePaths(publicCtx.fileStructure);
        let target: string | undefined = undefined;
        if (commonFiles.length > 1) {
          NotificationManager.showProgress({ message: t("command.fix.waitForFileSelection"), increment: 0 });
          let sortedFiles: string[] = commonFiles;
          const lastPicked = context.globalState.get<string>("lastPickedFile");
          if (lastPicked !== undefined && commonFiles.includes(lastPicked)) {
            sortedFiles = [lastPicked, ...commonFiles.filter(f => f !== lastPicked)];
          }
          target = await vscode.window.showQuickPick(sortedFiles, {
            placeHolder: t("command.fix.selectFileToWrite")
          });
        } else if (commonFiles.length === 1) {
          target = commonFiles[0];
        }
        if (typeof target === "string" && target.trim()) {
          mage.setOptions({ defaultFilePos: `${target.replaceAll("/", ".")}` });
          await context.globalState.update("lastPickedFile", target);
        } else {
          return;
        }
      }
      treeInstance.isSyncing = true;
      treeInstance.refresh();
      const previewChanges = getConfig<boolean>("general.previewChanges", true);
      const task = { task: "fix", fileToProcess: "" };
      if (!fixAll) {
        const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;
        if (currentFile === undefined) {
          NotificationManager.showWarning(t("common.noActiveEditorWarn"));
          return;
        }
        task.fileToProcess = currentFile;
      }
      const res = await mage.execute(task);
      if (token.isCancellationRequested) {
        treeInstance.isSyncing = false;
        treeInstance.refresh();
        return;
      }
      setTimeout(() => {
        NotificationManager.showResult(res, t("command.fix.viewDetails")).then(selection => {
          if (selection === t("command.fix.viewDetails")) {
            NotificationManager.showOutputChannel();
          }
        });
      }, 1000);
      const { updatedValues, patchedIds, countryMap } = mage.langDetail;
      if (res.success && [updatedValues, patchedIds].some(o => Object.keys(o).length > 0)) {
        if (previewChanges) {
          treeInstance.isSyncing = false;
          treeInstance.refresh();
          previewFixContent(updatedValues, patchedIds, countryMap, publicCtx.referredLang, async () => {
            await wrapWithProgress({ title: t("command.rewrite.progress") }, rewrite);
          });
        } else {
          await rewrite();
        }
      } else {
        treeInstance.isSyncing = false;
        treeInstance.refresh();
      }
    });
  };

  const fixDisposable = vscode.commands.registerCommand("i18nMage.fix", fix);
  const fixSingleFileDisposable = vscode.commands.registerCommand("i18nMage.fixSingleFile", () => fix(false));

  registerDisposable(fixDisposable);
  registerDisposable(fixSingleFileDisposable);
}
