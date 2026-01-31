import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { getValueByAmbiguousEntryName, displayToInternalName, escapeMarkdown, formatEscapeChar, unescapeString } from "@/utils/regex";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { isFileTooLarge } from "@/utils/fs";

export class HoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    if (isFileTooLarge(document.uri.fsPath)) return;
    const entry = ActiveEditorState.getEntryAtPosition(document, position);
    if (entry) {
      const entryKeys: string[] = [];
      const dynamicMatchInfo = ActiveEditorState.dynamicMatchInfo;
      const mage = LangMage.getInstance();
      const publicCtx = mage.getPublicContext();
      const { tree, dictionary } = mage.langDetail;
      const entryName = entry.nameInfo.name;
      if (entry.dynamic) {
        const matchedNames = dynamicMatchInfo.get(entryName) || [];
        const matchedKeys = matchedNames.map(name => getValueByAmbiguousEntryName(tree, name));
        entryKeys.push(...matchedKeys.filter((key): key is string => key !== undefined));
      } else {
        const entryKey = getValueByAmbiguousEntryName(tree, entryName);
        if (entryKey !== undefined) {
          entryKeys.push(entryKey);
        }
      }
      if (entryKeys.length > 0) {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        const referredLang = publicCtx.referredLang;
        const sortedLangList = [referredLang, ...mage.detectedLangList.filter(lang => lang !== referredLang)];
        for (const key of entryKeys) {
          const entryName = displayToInternalName(unescapeString(key));
          const entryInfo = dictionary[key]?.value ?? {};
          markdown.appendMarkdown(`\`${entryName}\`\n\n`);
          for (const lang of sortedLangList) {
            const value = entryInfo[lang] ?? "";
            const args = encodeURIComponent(
              JSON.stringify({ name: entryName, key, data: [key], meta: { scope: lang }, description: value })
            );
            const rewriteArgs = encodeURIComponent(JSON.stringify({ name: entryName, key, value: value, meta: { scope: lang } }));
            const rewriteBtn = ` [🔄](command:i18nMage.rewriteEntry?${rewriteArgs})`;
            if (value) {
              markdown.appendMarkdown(
                `[📍](command:i18nMage.goToDefinition?${args}) **${escapeMarkdown(lang)}:** ${escapeMarkdown(formatEscapeChar(value))} [📋](command:i18nMage.copyValue?${args}) [✏️](command:i18nMage.editValue?${args})${rewriteBtn}  \n`
              );
            } else {
              let translateBtn = "";
              if (entryInfo[publicCtx.referredLang]) {
                translateBtn = ` [🌐](command:i18nMage.fillMissingTranslations?${args})`;
              }
              markdown.appendMarkdown(
                `[🎈](command:i18nMage.goToDefinition?${args}) **${escapeMarkdown(lang)}**${translateBtn} [✏️](command:i18nMage.editValue?${args})${rewriteBtn}  \n`
              );
            }
          }
          markdown.appendMarkdown("\n");
          if (key !== entryKeys[entryKeys.length - 1]) {
            markdown.appendMarkdown("---\n\n");
          }
        }
        return new vscode.Hover(markdown);
      }
    }
  }
}
