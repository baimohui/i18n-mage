import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import previewFixContent from "@/views/fixWebview";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";

export function registerImportCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const importData = async () => {
    mage.setOptions({ task: "rewrite" });
    const res = await mage.execute();
    mage.setOptions({ task: "check" });
    await mage.execute();
    setTimeout(() => {
      treeInstance.refresh();
      res.defaultSuccessMessage = t("command.import.success");
      NotificationManager.showResult(res);
    }, 1000);
  };
  const disposable = vscode.commands.registerCommand("i18nMage.import", async () => {
    NotificationManager.showTitle(t("command.import.title"));
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: t("command.import.dialogTitle"),
      filters: {
        "Excel files": ["xlsx", "xls"]
      }
    };
    const fileUri = await vscode.window.showOpenDialog(options);
    if (Array.isArray(fileUri) && fileUri.length > 0) {
      await wrapWithProgress({ title: t("command.import.progress") }, async () => {
        const previewChanges = getConfig<boolean>("general.previewChanges", true);
        const filePath = fileUri[0].fsPath;

        const modeOptions = [
          { label: t("command.import.modeKey"), value: "key" },
          { label: t("command.import.modeLanguage"), value: "language" }
        ];
        const selectedMode = await vscode.window.showQuickPick(modeOptions, {
          placeHolder: t("command.import.selectMode")
        });

        if (!selectedMode) {
          return;
        }

        let baselineLanguage: string | undefined;
        if (selectedMode.value === "language") {
          const baselineOptions = mage.detectedLangList.map(lang => ({
            label: lang,
            value: lang
          }));
          const selectedBaseline = await vscode.window.showQuickPick(baselineOptions, {
            placeHolder: t("command.import.selectBaselineLanguage")
          });
          if (!selectedBaseline) {
            return;
          }
          baselineLanguage = selectedBaseline.value;
        }

        const res = await mage.execute({
          task: "import",
          importExcelFrom: filePath,
          importMode: selectedMode.value as "key" | "language",
          baselineLanguage
        });
        if (res.success) {
          const publicCtx = mage.getPublicContext();
          const { updatePayloads, patchedIds, countryMap } = mage.langDetail;
          if (updatePayloads.length > 0) {
            if (previewChanges) {
              previewFixContent(
                context,
                updatePayloads,
                patchedIds,
                countryMap,
                publicCtx.referredLang,
                async () => {
                  await wrapWithProgress({ title: t("command.rewrite.progress") }, importData);
                },
                async () => {
                  await mage.execute({ task: "check" });
                  treeInstance.refresh();
                }
              );
            } else {
              await importData();
            }
          } else {
            setTimeout(() => {
              NotificationManager.showWarning(t("command.import.nullWarn"));
            }, 1000);
          }
        } else if (res !== null) {
          setTimeout(() => {
            NotificationManager.showResult(res);
          }, 1000);
        }
      });
    }
  });

  registerDisposable(disposable);
}
