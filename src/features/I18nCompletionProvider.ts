import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { unescapeString } from "@/utils/regex";
import { getCacheConfig, getConfig } from "@/utils/config";
import { COMPLETION_DISPLAY_LANGUAGE_SOURCE, COMPLETION_MATCH_SCOPE, CompletionDisplayLanguageSource, CompletionMatchScope } from "@/types";

export class I18nCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
    const enableCompletion = getConfig<boolean>("completion.enable");
    if (!enableCompletion) return;
    const linePrefix = document.lineAt(position).text.substring(0, position.character);
    const { tFuncNames } = getCacheConfig();
    if (!tFuncNames.length) tFuncNames.push("t");
    const funcNamePattern = tFuncNames.map(fn => `\\b${fn}\\b`).join("|");
    const tReg = new RegExp(`(?:(?<=[$\\s.[({:="'\`]{1})|^)(${funcNamePattern})\\s*\\(\\s*(\\S)`, "g");
    if (!tReg.test(linePrefix)) return;
    const mage = LangMage.getInstance();
    const { countryMap } = mage.langDetail;
    const publicCtx = mage.getPublicContext();
    const displayLanguageSource = getConfig<CompletionDisplayLanguageSource>("completion.displayLanguageSource");
    let displayLang = publicCtx.referredLang;
    if (displayLanguageSource === COMPLETION_DISPLAY_LANGUAGE_SOURCE.display) {
      displayLang = getConfig<string>("general.displayLanguage");
    }
    const referredTranslation = countryMap[displayLang] ?? {};
    const entries = Object.entries(referredTranslation).map(([key, value]) => ({ name: unescapeString(key), value }));
    const matchScope = getConfig<CompletionMatchScope>("completion.matchScope");
    return entries.map(entry => {
      const item = new vscode.CompletionItem(entry.value, vscode.CompletionItemKind.Value);
      item.label = { label: entry.name, description: entry.value } as vscode.CompletionItemLabel;
      item.insertText = entry.name;
      if (matchScope === COMPLETION_MATCH_SCOPE.value) {
        item.label = entry.value;
        item.detail = entry.name;
        item.filterText = `${entry.value}`.split("").join("-");
      } else if (matchScope === COMPLETION_MATCH_SCOPE.key) {
        item.filterText = `${entry.name}`.split("").join("-");
      } else {
        item.filterText = `${entry.name} ${entry.value}`.split("").join("-");
      }
      return item;
    });
  }
}
