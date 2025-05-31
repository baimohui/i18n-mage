import * as vscode from "vscode";
import { formatForFile } from "@/utils/regex";
import { registerDisposable } from "@/utils/dispose";

export function registerCopyKeyValueCommand() {
  const disposable = vscode.commands.registerCommand(
    "i18nMage.copyKeyValue",
    async (e: vscode.TreeItem & { data: { name: string; value: string }[] }) => {
      const content = e.data.map(i => `${formatForFile(i.name)}: ${formatForFile(i.value)},`).join("\n");
      await vscode.env.clipboard.writeText(content);
      vscode.window.showInformationMessage(`已复制：${content}`);
    }
  );

  registerDisposable(disposable);
}
