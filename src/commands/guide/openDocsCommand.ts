import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { getLangCode } from "@/utils/langKey";

export function registerOpenDocsCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.openDocs", () => {
    const enReadmeUrl = "https://github.com/baimohui/i18n-mage?tab=readme-ov-file#readme";
    const cnReadmeUrl = "https://baimohui.github.io/i18n-mage-docs/zh/guide/introduction.html";
    const isCn = getLangCode(vscode.env.language) === "zh-CN";
    vscode.env.openExternal(vscode.Uri.parse(isCn ? cnReadmeUrl : enReadmeUrl));
  });

  registerDisposable(disposable);
}
