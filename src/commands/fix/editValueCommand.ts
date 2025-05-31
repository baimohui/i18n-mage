import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";

export function registerEditValueCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.editValue",
    async (e: vscode.TreeItem & { data: { name: string; key: string; value: string; lang: string } }) => {
      if (typeof e.data !== "object" || Object.keys(e.data).length === 0) return;
      const { name, value, lang } = e.data;
      const newValue = await vscode.window.showInputBox({
        prompt: `修改 ${name} 的 ${lang} 值`,
        value
      });
      if (typeof newValue === "string" && newValue !== value && newValue.trim() !== "") {
        mage.setOptions({
          task: "modify",
          modifyList: [{ ...e.data, value: newValue }],
          globalFlag: false,
          clearCache: false,
          rewriteFlag: true
        });
        const success = await mage.execute();
        if (success) {
          e.description = newValue;
          treeInstance.refresh();
          vscode.window.showInformationMessage(`已写入：${newValue}`);
        }
      }
    }
  );

  context.subscriptions.push(disposable);
}
