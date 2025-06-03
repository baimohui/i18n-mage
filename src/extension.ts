import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { DecoratorController } from "@/features/Decorator";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerAllCommands } from "@/commands";
import { registerAllListeners } from "@/listeners";
import { bindDisposablesToContext } from "@/utils/dispose";

/**
 * 插件被激活时触发，所有代码总入口
 * @param context 插件上下文
 */
export function activate(context: vscode.ExtensionContext): void {
  vscode.window.registerTreeDataProvider("treeProvider", treeInstance);
  registerAllCommands();
  registerAllListeners();
  bindDisposablesToContext(context);

  wrapWithProgress({
    title: "初始化中...",
    callback: async () => {
      await treeInstance.initTree();
      if (vscode.window.activeTextEditor) {
        const decorator = DecoratorController.getInstance();
        decorator.update(vscode.window.activeTextEditor);
      }
    }
  });
}
