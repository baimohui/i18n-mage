import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { getValueByAmbiguousEntryName, displayToInternalName, escapeMarkdown, formatEscapeChar, unescapeString } from "@/utils/regex";
import { ActiveEditorState } from "@/utils/activeEditorState";

export class HoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const entry = ActiveEditorState.getEntryAtPosition(document, position);
    if (entry) {
      const entryKeys: string[] = [];
      const dynamicMatchInfo = ActiveEditorState.dynamicMatchInfo;
      const mage = LangMage.getInstance();
      const publicCtx = mage.getPublicContext();
      const { tree, dictionary } = mage.langDetail;
      const entryName = entry.nameInfo.name;
      if (entry.dynamic) {
        const matchKeys = dynamicMatchInfo.get(entryName) || [];
        entryKeys.push(...matchKeys);
      } else {
        const entryKey = getValueByAmbiguousEntryName(tree, entryName);
        if (entryKey !== undefined) {
          entryKeys.push(entryKey);
        }
      }
      if (entryKeys.length > 0) {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        for (const key of entryKeys) {
          const entryName = displayToInternalName(unescapeString(key));
          const entryInfo = dictionary[key]?.value ?? {};
          const rewriteBtn = `[🔄](command:i18nMage.rewriteEntry?${encodeURIComponent(JSON.stringify({ name: entryName, key, value: entryInfo[publicCtx.referredLang] ?? "" }))})`;
          markdown.appendMarkdown(`\`${entryName}\` ${rewriteBtn}\n\n`);
          for (const lang of mage.detectedLangList) {
            const value = entryInfo[lang] ?? "";
            const args = encodeURIComponent(
              JSON.stringify({ name: entryName, key, data: [key], meta: { scope: lang }, description: value })
            );
            if (value) {
              markdown.appendMarkdown(
                `[📍](command:i18nMage.goToDefinition?${args}) **${escapeMarkdown(lang)}:** ${escapeMarkdown(formatEscapeChar(value))} [📋](command:i18nMage.copyValue?${args}) [✏️](command:i18nMage.editValue?${args})  \n`
              );
            } else {
              let translateBtn = "";
              if (entryInfo[publicCtx.referredLang]) {
                translateBtn = ` [🌐](command:i18nMage.fillMissingTranslations?${args})`;
              }
              markdown.appendMarkdown(
                `[🎈](command:i18nMage.goToDefinition?${args}) **${escapeMarkdown(lang)}**${translateBtn} [✏️](command:i18nMage.editValue?${args})  \n`
              );
            }
          }
          markdown.appendMarkdown("\n");
        }
        return new vscode.Hover(markdown);
      }
    }
  }
}
