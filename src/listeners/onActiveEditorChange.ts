import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { debounce } from "@/utils/common";
import { isFileTooLarge } from "@/utils/fs";
import { isValidI18nCallablePath } from "@/utils/regex";
import { NotificationManager } from "@/utils/notification";
import { t } from "@/utils/i18n";
import { getCacheConfig } from "@/utils/config";
import { getWorkspaceScopeKey } from "@/utils/workspace";

export function registerOnActiveEditorChange() {
  let activeWorkspaceKey = getWorkspaceScopeKey(vscode.window.activeTextEditor?.document.uri);
  const debouncedHandler = debounce(async (editor: vscode.TextEditor | undefined) => {
    const nextWorkspaceKey = getWorkspaceScopeKey(editor?.document.uri);
    const workspaceChanged = nextWorkspaceKey !== activeWorkspaceKey;
    activeWorkspaceKey = nextWorkspaceKey;
    if (workspaceChanged && treeInstance.isInitialized) {
      await treeInstance.initTree();
      return;
    }

    if (treeInstance.isInitialized) {
      const filePath = editor?.document.uri.fsPath ?? "";
      if (isValidI18nCallablePath(filePath)) {
        const largeFileFlag = isFileTooLarge(filePath);
        if (largeFileFlag) {
          const fileSizeSkipThresholdKB = getCacheConfig<number>("analysis.fileSizeSkipThresholdKB");
          NotificationManager.setStatusBarMessage(t("command.check.fileSizeExceedsThresholdSkipParsing", fileSizeSkipThresholdKB));
        }
      }
      treeInstance.refresh();
    }
  }, 300);
  const disposable = vscode.window.onDidChangeActiveTextEditor(debouncedHandler);
  registerDisposable(disposable);
}
