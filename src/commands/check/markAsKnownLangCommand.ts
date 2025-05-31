import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { LANG_INTRO_MAP, getLangIntro } from "@/utils/const";

export function registerMarkAsKnownLangCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.markAsKnownLang", async ({ key: langKey }) => {
    try {
      const reverseMap: Record<string, string> = {};
      const languageList = Object.entries(LANG_INTRO_MAP)
        .map(([key, info]) => {
          reverseMap[info.cnName] = key;
          return info.cnName;
        })
        .filter(cnName => mage.detectedLangList.every(i => getLangIntro(i)?.cnName !== cnName));
      const selectedText = await vscode.window.showQuickPick(languageList, {
        placeHolder: `标记 ${langKey} 所属语言`
      });
      if (typeof selectedText === "string" && selectedText.trim()) {
        const selectedKey = reverseMap[selectedText];
        const config = vscode.workspace.getConfiguration("i18n-mage");
        const mappings = config.get<Record<string, string[]>>("langAliasCustomMappings") || {};
        const aliases = new Set(mappings[selectedKey] ?? []);
        if (!aliases.has(langKey as string)) {
          aliases.add(langKey as string);
          await config.update(
            "langAliasCustomMappings",
            { ...mappings, [selectedKey]: Array.from(aliases) },
            vscode.ConfigurationTarget.Global
          );
          vscode.window.showInformationMessage(`已添加映射：${langKey} → ${selectedText}`);
        } else {
          vscode.window.showWarningMessage(`[${langKey}] 已存在于 ${selectedText} 的别名列表`);
        }
      }
    } catch (err) {
      vscode.window.showErrorMessage(`标记失败：${err instanceof Error ? err.message : "发生未知错误"}`);
    }
  });

  context.subscriptions.push(disposable);
}
