import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { unescapeString } from "@/utils/regex";
import { getCacheConfig } from "@/utils/config";

export class I18nCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
    const linePrefix = document.lineAt(position).text.substring(0, position.character);
    const { tFuncNames } = getCacheConfig();
    if (!tFuncNames.length) tFuncNames.push("t");
    const funcNamePattern = tFuncNames.map(fn => `\\b${fn}\\b`).join("|");
    const tReg = new RegExp(`(?<=[$\\s.[({:="']{1})(${funcNamePattern})\\s*\\(\\s*(\\S)`, "g");
    if (!tReg.test(linePrefix)) {
      return undefined;
    }
    const mage = LangMage.getInstance();
    const { countryMap } = mage.langDetail;
    const publicCtx = mage.getPublicContext();
    const referredTranslation = countryMap[publicCtx.referredLang] ?? {};
    const entries = Object.entries(referredTranslation).map(([key, value]) => ({ name: unescapeString(key), value }));
    return entries.map(entry => {
      const item = new vscode.CompletionItem(entry.value, vscode.CompletionItemKind.Value);
      item.label = {
        label: entry.name,
        description: entry.value
      } as vscode.CompletionItemLabel;
      item.insertText = entry.name;
      item.filterText = `${entry.name} ${entry.value}`;
      return item;
    });
  }
}
