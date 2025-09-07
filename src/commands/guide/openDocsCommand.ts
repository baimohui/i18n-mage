import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";

export function registerOpenDocsCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.openDocs", () => {
    const enReadmeUrl = "https://github.com/baimohui/i18n-mage?tab=readme-ov-file#readme";
    const cnReadmeUrl = "https://github.com/baimohui/i18n-mage/blob/main/README.zh-CN.md";
    vscode.env.openExternal(vscode.Uri.parse(vscode.env.language === "zh-CN" ? cnReadmeUrl : enReadmeUrl));
  });

  registerDisposable(disposable);
}
