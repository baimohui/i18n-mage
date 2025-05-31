import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";

export function registerExportCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.export", async () => {
    const options: vscode.SaveDialogOptions = {
      saveLabel: "Save Excel file",
      filters: {
        "Excel files": ["xlsx", "xls"]
      }
    };
    const fileUri = await vscode.window.showSaveDialog(options);
    if (fileUri) {
      wrapWithProgress({
        title: "导出中...",
        callback: async () => {
          const filePath = fileUri.fsPath;
          mage.setOptions({ task: "export", exportExcelTo: filePath });
          const success = await mage.execute();
          if (success) {
            vscode.window.showInformationMessage("Export success");
          }
        }
      });
    }
  });

  registerDisposable(disposable);
}
