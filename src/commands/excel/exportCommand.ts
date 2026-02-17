import * as vscode from "vscode";
import * as path from "path";
import LangMage from "@/core/LangMage";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export function registerExportCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.export", async () => {
    NotificationManager.showTitle(t("command.export.title"));
    const publicCtx = mage.getPublicContext();
    const baseDir = pickFirstNonEmptyPath([publicCtx.projectPath, publicCtx.langPath, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath]);
    const projectName = getProjectName(pickFirstNonEmptyPath([baseDir, publicCtx.projectPath, publicCtx.langPath]) ?? "project");
    const defaultName = `${projectName}-i18n-full-${formatDate(new Date())}.xlsx`;
    const options: vscode.SaveDialogOptions = {
      saveLabel: t("command.export.dialogTitle"),
      defaultUri: typeof baseDir === "string" && baseDir.length > 0 ? vscode.Uri.file(path.join(baseDir, defaultName)) : undefined,
      filters: {
        "Excel files": ["xlsx", "xls"]
      }
    };
    const fileUri = await vscode.window.showSaveDialog(options);
    if (fileUri) {
      await wrapWithProgress({ title: t("command.export.progress") }, async () => {
        const filePath = fileUri.fsPath;
        mage.setOptions({ task: "export", exportExcelTo: filePath });
        const res = await mage.execute();
        setTimeout(() => {
          res.defaultSuccessMessage = t("command.export.success");
          NotificationManager.showResult(res);
        }, 1000);
      });
    }
  });

  registerDisposable(disposable);
}

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getProjectName(targetPath: string) {
  const raw = path.basename(targetPath).trim() || "project";
  return raw.replace(/[<>:"/\\|?*\s]+/g, "-");
}

function pickFirstNonEmptyPath(candidates: Array<string | undefined>) {
  for (const item of candidates) {
    if (typeof item === "string" && item.length > 0) {
      return item;
    }
  }
  return undefined;
}
