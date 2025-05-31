import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { PluginConfiguration } from "@/types";

export function registerDeleteUnusedCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const config = vscode.workspace.getConfiguration("i18n-mage") as PluginConfiguration;
  const disposable = vscode.commands.registerCommand(
    "i18nMage.deleteUnused",
    async (e: vscode.TreeItem & { data: { name: string; key: string }[] }) => {
      if (typeof e.label !== "string" || e.label.trim() === "" || !Array.isArray(e.data) || e.data.length === 0) return;
      const confirmDelete = await vscode.window.showWarningMessage(
        "确定删除吗？",
        { modal: true, detail: `将删除词条：${e.data.map(item => item.name).join(", ")}` },
        { title: "确定" }
      );
      if (confirmDelete?.title === "确定") {
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
          vscode.window.showInformationMessage("删除成功");
        }
      }
    }
  );

  context.subscriptions.push(disposable);
}
