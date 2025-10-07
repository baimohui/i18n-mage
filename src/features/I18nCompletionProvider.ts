import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { unescapeString } from "@/utils/regex";
import { getCacheConfig, getConfig } from "@/utils/config";
import {
  COMPLETION_DISPLAY_LANGUAGE_SOURCE,
  COMPLETION_MATCH_SCOPE,
  COMPLETION_PINYIN_SEARCH,
  CompletionDisplayLanguageSource,
  CompletionMatchScope,
  CompletionPinyinSearch // 新增类型
} from "@/types";
import * as pinyin from "tiny-pinyin";
import { getLangCode } from "@/utils/langKey";

export class I18nCompletionProvider implements vscode.CompletionItemProvider {
  private cachedTReg: RegExp | null = null;
  private cachedFuncNames: string[] = [];

  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
    // 提前返回检查
    const enableCompletion = getConfig<boolean>("completion.enable");
    if (!enableCompletion) return;

    const linePrefix = document.lineAt(position).text.substring(0, position.character);
    const { tFuncNames } = getCacheConfig();
    if (!tFuncNames.length) tFuncNames.push("t");

    // 检查是否匹配翻译函数调用
    if (!this.isTranslationFunctionCall(linePrefix, tFuncNames)) return;

    // 获取配置
    const config = {
      displayLanguageSource: getConfig<CompletionDisplayLanguageSource>("completion.displayLanguageSource"),
      matchScope: getConfig<CompletionMatchScope>("completion.matchScope"),
      pinyinMode: getConfig<CompletionPinyinSearch>("completion.pinyinSearch")
    };

    // 获取翻译数据
    const mage = LangMage.getInstance();
    const { countryMap } = mage.langDetail;
    const publicCtx = mage.getPublicContext();

    const displayLang = this.getDisplayLanguage(config.displayLanguageSource, publicCtx.referredLang);
    const referredTranslation = countryMap[displayLang] ?? {};
    const isChinese = getLangCode(displayLang)?.includes("zh") ?? false;

    // 创建补全项
    return this.createCompletionItems(referredTranslation, config.matchScope, isChinese ? config.pinyinMode : COMPLETION_PINYIN_SEARCH.off);
  }

  private isTranslationFunctionCall(linePrefix: string, tFuncNames: string[]): boolean {
    if (!this.cachedTReg || !this.arraysEqual(this.cachedFuncNames, tFuncNames)) {
      const funcNamePattern = tFuncNames.map(fn => `\\b${fn}\\b`).join("|");
      this.cachedTReg = new RegExp(`(?:(?<=[$\\s.[({:="'\`])|^)(${funcNamePattern})\\s*\\(\\s*(\\S)`, "g");
      this.cachedFuncNames = [...tFuncNames];
    }
    return this.cachedTReg.test(linePrefix);
  }

  private arraysEqual(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((val, index) => val === b[index]);
  }

  private getDisplayLanguage(source: CompletionDisplayLanguageSource, referredLang: string): string {
    if (source === COMPLETION_DISPLAY_LANGUAGE_SOURCE.display) {
      return getConfig<string>("general.displayLanguage");
    }
    return referredLang;
  }

  private createCompletionItems(
    translation: Record<string, string>,
    matchScope: CompletionMatchScope,
    pinyinMode: CompletionPinyinSearch
  ): vscode.CompletionItem[] {
    const entries = Object.entries(translation).map(([key, value]) => ({
      name: unescapeString(key),
      value
    }));

    return entries.map(entry => {
      return this.createCompletionItem(entry, matchScope, pinyinMode);
    });
  }

  private calculatePinyin(text: string, pinyinMode: CompletionPinyinSearch): { full: string; abbr: string } {
    const result = { full: "", abbr: "" };

    if (pinyinMode === COMPLETION_PINYIN_SEARCH.off || !text) {
      return result;
    }

    try {
      if (pinyinMode === COMPLETION_PINYIN_SEARCH.full || pinyinMode === COMPLETION_PINYIN_SEARCH.both) {
        result.full = pinyin.convertToPinyin(text, "", true);
      }

      if (pinyinMode === COMPLETION_PINYIN_SEARCH.abbr || pinyinMode === COMPLETION_PINYIN_SEARCH.both) {
        result.abbr = pinyin
          .convertToPinyin(text, " ", true)
          .split(" ")
          .map(word => word[0] || "")
          .join("");
      }
    } catch (error) {
      console.warn("Pinyin conversion failed:", error);
    }

    return result;
  }

  private addChineseDash(text: string) {
    if (typeof text !== "string") return text;

    let result = "";
    let lastType = ""; // 上一个字符的类型：'chinese' 或 'non-chinese'

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const isChinese = /[\u4e00-\u9fa5]/.test(char);
      const currentType = isChinese ? "chinese" : "non-chinese";

      if (lastType && (lastType !== currentType || lastType === "chinese")) {
        // 当字符类型发生变化时，添加连接符
        result += "-";
      }

      result += char;
      lastType = currentType;
    }

    return result;
  }

  private createCompletionItem(
    entry: { name: string; value: string },
    matchScope: CompletionMatchScope,
    pinyinMode: CompletionPinyinSearch
  ): vscode.CompletionItem {
    const item = new vscode.CompletionItem(entry.value, vscode.CompletionItemKind.Value);

    item.label = { label: entry.name, description: entry.value };
    if (matchScope === COMPLETION_MATCH_SCOPE.key) {
      item.label = { label: entry.name, description: entry.value };
      item.filterText = entry.name;
    } else if (pinyinMode !== COMPLETION_PINYIN_SEARCH.off) {
      const textWithDash = this.addChineseDash(entry.value);
      const pinyinData = this.calculatePinyin(textWithDash, pinyinMode);
      item.filterText =
        `${pinyinData.abbr} ${matchScope === COMPLETION_MATCH_SCOPE.value ? "" : entry.name} ${pinyinData.full} ${textWithDash}`.trim();
    } else {
      item.filterText = `${matchScope === COMPLETION_MATCH_SCOPE.value ? "" : entry.name} ${entry.value}`.trim();
    }

    item.insertText = entry.name;
    return item;
  }
}
