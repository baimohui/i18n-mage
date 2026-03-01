import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import LangMage from "@/core/LangMage";
import { registerDisposable } from "@/utils/dispose";
import { throttle } from "@/utils/common";
import { isValidI18nCallablePath } from "@/utils/regex";
import { isPathInsideDirectory } from "@/utils/fs";
import { getCacheConfig } from "@/utils/config";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import type { CheckScope } from "@/types";

export function registerOnFileSave() {
  let pendingScope: CheckScope | null = null;

  const mergeScope = (nextScope: CheckScope) => {
    if (nextScope === "full") {
      pendingScope = "full";
      return;
    }
    if (pendingScope === null) {
      pendingScope = nextScope;
    }
  };

  const scheduleCheck = throttle(
    async () => {
      const targetScope = pendingScope;
      pendingScope = null;
      if (targetScope === null) return;
      const mage = LangMage.getInstance();
      const publicCtx = mage.getPublicContext();
      const analysisOnSave = getCacheConfig<boolean>("analysis.onSave");
      if (!analysisOnSave || publicCtx.langPath.trim().length === 0) return;
      await wrapWithProgress({ title: "" }, async () => {
        await mage.execute({ task: "check", globalFlag: true, checkScope: targetScope });
        treeInstance.refresh();
      });
    },
    1500,
    false,
    true
  );

  const onPathChanged = (uri: vscode.Uri) => {
    if (uri.scheme !== "file") return;
    if (vscode.workspace.getWorkspaceFolder(uri) === undefined) return;
    const filePath = uri.fsPath;
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    const isLangFile = isPathInsideDirectory(publicCtx.langPath, filePath);
    const isUsageFile = isValidI18nCallablePath(filePath);
    if (!isLangFile && !isUsageFile) return;
    mergeScope(isLangFile ? "full" : "usageOnly");
    void scheduleCheck();
  };

  const onDidSave = vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => {
    onPathChanged(doc.uri);
  });
  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  const onDidChange = watcher.onDidChange(onPathChanged);
  const onDidCreate = watcher.onDidCreate(onPathChanged);
  const onDidDelete = watcher.onDidDelete(onPathChanged);

  registerDisposable(onDidSave);
  registerDisposable(watcher);
  registerDisposable(onDidChange);
  registerDisposable(onDidCreate);
  registerDisposable(onDidDelete);
}
