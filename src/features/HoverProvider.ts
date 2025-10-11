import * as vscode from "vscode";
import { DecoratorController } from "./Decorator";
import LangMage from "@/core/LangMage";
import { getValueByAmbiguousEntryName, displayToInternalName, escapeMarkdown, formatEscapeChar } from "@/utils/regex";

export class HoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const decorator = DecoratorController.getInstance();
    const entry = decorator.entries.find(item => {
      const [startPos, endPos] = item.pos.split(",").map(pos => document.positionAt(decorator.offsetBase + +pos - 1));
      const range = new vscode.Range(startPos, endPos);
      return range.contains(position);
    });
    if (entry) {
      const mage = LangMage.getInstance();
      const publicCtx = mage.getPublicContext();
      const { tree, dictionary } = mage.langDetail;
      const entryName = displayToInternalName(entry.nameInfo.text);
      const entryKey = getValueByAmbiguousEntryName(tree, entryName);
      if (entryKey !== undefined) {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        markdown.appendMarkdown(`\`${entryName}\`\n\n`);
        const entryInfo = dictionary[entryKey]?.value ?? {};
        for (const lang of mage.detectedLangList) {
          const value = entryInfo[lang] ?? "";
          const args = encodeURIComponent(
            JSON.stringify({ name: entryName, key: entryKey, data: [entryKey], meta: { scope: lang }, description: value })
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
        return new vscode.Hover(markdown);
      }
    }
  }
}
