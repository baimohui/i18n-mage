import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import LangMage from "@/core/LangMage";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { PluginConfiguration } from "@/types";
import { registerAllCommands } from "@/commands";

/**
 * 插件被激活时触发，所有代码总入口
 * @param context 插件上下文
 */
export function activate(context: vscode.ExtensionContext): void {
  const mage = LangMage.getInstance();

  vscode.window.registerTreeDataProvider("treeProvider", treeInstance);
  registerAllCommands(context);

  wrapWithProgress({
    title: "初始化中...",
    callback: async () => {
      await treeInstance.initTree();
    }
  });

  const onDidChangeConfigDisposable = vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration("i18n-mage")) return;
    const config = vscode.workspace.getConfiguration("i18n-mage") as PluginConfiguration;
    if (event.affectsConfiguration("i18n-mage.syncBasedOnReferredEntries")) {
      const publicCtx = mage.getPublicContext();
      mage.setOptions({ syncBasedOnReferredEntries: config.syncBasedOnReferredEntries });
      vscode.commands.executeCommand("i18nMage.setReferredLang", publicCtx.referredLang);
    }
  });

  context.subscriptions.push(onDidChangeConfigDisposable);
}
