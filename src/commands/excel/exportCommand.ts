import * as vscode from "vscode";
import * as path from "path";
import LangMage from "@/core/LangMage";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { resolveEntryKeyFromName } from "@/utils/regex";
import { isPathInsideDirectory, isSamePath, toRelativePath } from "@/utils/fs";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

type ExportScope = "full" | "entries";
type ExportTargetArg = vscode.Uri | undefined;

export function registerExportCommand() {
  const mage = LangMage.getInstance();

  const resolveExportKeysByUri = async (uri: vscode.Uri) => {
    const { dictionary, used, tree } = mage.langDetail;
    const directory = await isDirectoryUri(uri);
    const selectedFsPath = uri.fsPath;

    const matchedEntryNames = Object.entries(used).reduce((acc, [entryName, filePosMap]) => {
      const hasMatchedFile = Object.keys(filePosMap).some(filePath =>
        directory ? isPathInsideDirectory(selectedFsPath, filePath) : isSamePath(selectedFsPath, filePath)
      );
      if (hasMatchedFile) {
        acc.push(entryName);
      }
      return acc;
    }, [] as string[]);

    const matchedKeys = matchedEntryNames.reduce((acc, entryName) => {
      const key = resolveEntryKeyFromName(tree, entryName);
      if (typeof key === "string" && Object.hasOwn(dictionary, key)) {
        acc.push(key);
      }
      return acc;
    }, [] as string[]);

    const exportKeys = Array.from(new Set(matchedKeys));
    if (exportKeys.length === 0) {
      NotificationManager.showWarning(t("command.exportEntries.noEntriesInTarget", toRelativePath(uri.fsPath) || uri.fsPath));
      return null;
    }
    return exportKeys;
  };

  const runExport = async (scope: ExportScope, targetUri: ExportTargetArg = undefined) => {
    NotificationManager.showTitle(t(scope === "entries" ? "command.exportEntries.title" : "command.export.title"));

    let exportKeys: string[] = [];
    if (scope === "entries") {
      if (targetUri === undefined) {
        const activeUri = vscode.window.activeTextEditor?.document.uri;
        if (activeUri?.scheme === "file") {
          targetUri = activeUri;
        }
      }

      if (targetUri === undefined) {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: t("command.exportEntries.openLabel")
        });
        if (selected === undefined || selected.length === 0) return;
        targetUri = selected[0];
      }

      if (targetUri.scheme !== "file") {
        NotificationManager.showWarning(t("command.exportEntries.invalidTarget"));
        return;
      }

      const resolved = await resolveExportKeysByUri(targetUri);
      if (resolved === null || resolved.length === 0) return;
      exportKeys = resolved;
    }

    const publicCtx = mage.getPublicContext();
    const baseDir = pickFirstNonEmptyPath([publicCtx.projectPath, publicCtx.langPath, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath]);
    const projectName = getProjectName(pickFirstNonEmptyPath([baseDir, publicCtx.projectPath, publicCtx.langPath]) ?? "project");
    const dateText = formatDate(new Date());
    const targetName =
      scope === "entries" && targetUri !== undefined
        ? getProjectName(path.parse(targetUri.fsPath).name || path.basename(targetUri.fsPath))
        : "";
    const defaultName =
      scope === "entries" && targetName
        ? `${projectName}-i18n-entries-${targetName}-${dateText}.xlsx`
        : `${projectName}-i18n-full-${dateText}.xlsx`;
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
        mage.setOptions({ task: "export", exportExcelTo: filePath, exportKeys });
        const res = await mage.execute();
        setTimeout(() => {
          res.defaultSuccessMessage = t("command.export.success");
          NotificationManager.showResult(res);
        }, 1000);
      });
    }
  };

  const disposable = vscode.commands.registerCommand("i18nMage.export", async () => {
    await runExport("full");
  });

  const entriesDisposable = vscode.commands.registerCommand("i18nMage.exportEntries", async (uri: ExportTargetArg) => {
    await runExport("entries", uri);
  });

  registerDisposable(disposable);
  registerDisposable(entriesDisposable);
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

async function isDirectoryUri(uri: vscode.Uri) {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return (stat.type & vscode.FileType.Directory) !== 0;
  } catch {
    return false;
  }
}
