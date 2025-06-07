import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { DecoratorController } from "@/features/Decorator";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerAllCommands } from "@/commands";
import { registerAllListeners } from "@/listeners";
import { bindDisposablesToContext } from "@/utils/dispose";
import { NotificationManager } from "@/utils/notification";
import { t } from "@/utils/i18n";

/**
 * 插件被激活时触发，所有代码总入口
 * @param context 插件上下文
 */
export async function activate(context: vscode.ExtensionContext) {
  NotificationManager.init();
  vscode.window.registerTreeDataProvider("treeProvider", treeInstance);
  registerAllCommands();
  registerAllListeners();
  bindDisposablesToContext(context);

  await wrapWithProgress({ title: t("common.init.progress") }, async () => {
    await treeInstance.initTree();
    if (vscode.window.activeTextEditor) {
      const decorator = DecoratorController.getInstance();
      decorator.update(vscode.window.activeTextEditor);
    }
  });
}
