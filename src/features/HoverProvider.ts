import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { getValueByAmbiguousEntryName, displayToInternalName, escapeMarkdown, formatEscapeChar, unescapeString } from "@/utils/regex";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { isFileTooLarge } from "@/utils/fs";
import { t } from "@/utils/i18n";

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
          const usedInfo = mage.langDetail.used[entryName] ?? {};
          const referenceCount = Object.values(usedInfo).reduce((total, posSet) => total + posSet.size, 0);

          markdown.appendMarkdown(`**\`${entryName}\`**`);
          if (referenceCount > 0) {
            const refArgs = encodeURIComponent(JSON.stringify({ key: entryName }));
            markdown.appendMarkdown(` [🔗](command:i18nMage.findReferences?${refArgs}) ${t("hover.referenceCount", referenceCount)}\n\n`);
          }
          markdown.appendMarkdown("\n\n");

          for (const lang of sortedLangList) {
            const value = entryInfo[lang] ?? "";
            const args = encodeURIComponent(JSON.stringify({ name: entryName, key, data: [key], meta: { lang }, description: value }));
            const rewriteArgs = encodeURIComponent(JSON.stringify({ name: entryName, key, value: value, meta: { lang } }));

            const isReferenceLang = lang === referredLang;
            const langLabel = isReferenceLang ? `**${escapeMarkdown(lang)}** (${t("hover.referenceLanguage")})` : escapeMarkdown(lang);
            const goToDefBtn = `[📍](command:i18nMage.goToDefinition?${args})`;
            const copyBtn = value ? `[📋](command:i18nMage.copyValue?${args})` : "";
            const editBtn = `[✏️](command:i18nMage.editValue?${args})`;
            const rewriteBtn = `[🔄](command:i18nMage.rewriteEntry?${rewriteArgs})`;
            const translateBtn =
              !value && entryInfo[publicCtx.referredLang] ? `[🌐](command:i18nMage.fillMissingTranslations?${args})` : "";

            markdown.appendMarkdown(`${goToDefBtn} ${langLabel}: `);
            if (value) {
              markdown.appendMarkdown(`${escapeMarkdown(formatEscapeChar(value))}`);
            } else {
              markdown.appendMarkdown(`*${t("hover.empty")}*`);
            }
            markdown.appendMarkdown(` ${copyBtn}${translateBtn}${editBtn}${rewriteBtn}\n\n`);
          }

          if (key !== entryKeys[entryKeys.length - 1]) {
            markdown.appendMarkdown("---\n\n");
          }
        }
        return new vscode.Hover(markdown);
      }
    }
  }
}
