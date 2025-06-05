import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { PluginConfiguration } from "@/types";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";

export function registerDeleteUnusedCommand() {
  const mage = LangMage.getInstance();
  const config = vscode.workspace.getConfiguration("i18n-mage") as PluginConfiguration;
  const disposable = vscode.commands.registerCommand(
    "i18nMage.deleteUnused",
    async (e: vscode.TreeItem & { data: { name: string; key: string }[] }) => {
      if (typeof e.label !== "string" || e.label.trim() === "" || !Array.isArray(e.data) || e.data.length === 0) return;
      const confirmDelete = await vscode.window.showWarningMessage(
        t("command.deleteUnused.modalTitle"),
        { modal: true, detail: t("command.deleteUnused.modalContent", e.data.map(item => item.name).join(", ")) },
        { title: t("common.confirm") }
      );
      if (confirmDelete?.title === t("common.confirm")) {
        mage.setOptions({
          task: "trim",
          trimKeyList: e.data.map(item => item.key),
          globalFlag: false,
          clearCache: false,
          rewriteFlag: true
        });
        const success = await mage.execute();
        if (success) {
          mage.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
          await mage.execute();
          treeInstance.refresh();
          vscode.window.showInformationMessage(t("command.deleteUnused.success"));
        }
      }
    }
  );

  registerDisposable(disposable);
}
