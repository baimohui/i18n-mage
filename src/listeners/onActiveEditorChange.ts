import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { debounce } from "@/utils/common";
import { isFileTooLarge } from "@/utils/fs";
import { NotificationManager } from "@/utils/notification";
import { t } from "@/utils/i18n";
import { getCacheConfig } from "@/utils/config";

export function registerOnActiveEditorChange() {
  const debouncedHandler = debounce((editor: vscode.TextEditor | undefined) => {
    const largeFileFlag = isFileTooLarge(editor?.document.uri.fsPath ?? "");
    if (largeFileFlag) {
      const fileSizeSkipThresholdKB = getCacheConfig<number>("analysis.fileSizeSkipThresholdKB");
      NotificationManager.setStatusBarMessage(t("command.check.fileSizeExceedsThresholdSkipParsing", fileSizeSkipThresholdKB));
    }
    if (treeInstance.isInitialized) {
      treeInstance.refresh();
    }
  }, 300);
  const disposable = vscode.window.onDidChangeActiveTextEditor(debouncedHandler);
  registerDisposable(disposable);
}
