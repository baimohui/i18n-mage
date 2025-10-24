import {
  LangContextInternal,
  LackInfo,
  NAMESPACE_STRATEGY,
  EntryClassTreeItem,
  FixExecutionResult,
  EXECUTION_RESULT_CODE,
  KEY_GENERATION_FILL_SCOPE,
  KEY_STRATEGY,
  I18nUpdatePayload
} from "@/types";
import { getLangCode } from "@/utils/langKey";
import { TEntry, I18N_FRAMEWORK } from "@/types";
import {
  getIdByStr,
  getValueByAmbiguousEntryName,
  internalToDisplayName,
  generateKey,
  unescapeString,
  convertKeyToVueI18nPath,
  splitFileName
} from "@/utils/regex";
import { getDetectedLangList } from "@/core/tools/contextTools";
import translateTo from "@/translator/index";
import { t } from "@/utils/i18n";
import { ExecutionContext } from "@/utils/context";
import { NotificationManager } from "@/utils/notification";
import * as pinyin from "tiny-pinyin";
import { toRelativePath } from "@/utils/fs";

export class FixHandler {
  private lackInfoFromUndefined: LackInfo;
  private needFix: boolean = false;
  private patchedNum: number = 0;
  constructor(private ctx: LangContextInternal) {
    this.lackInfoFromUndefined = {};
  }

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public async run(): Promise<FixExecutionResult> {
    try {
      this.needFix = false;
      this.patchedNum = 0;
      if (!this.ctx.referredLang) {
        return {
          success: false,
          message: t("command.fix.noReferredLang"),
          code: EXECUTION_RESULT_CODE.NoReferredLang
        };
      }
      if (this.ctx.undefinedEntryList.length > 0 && this.ctx.fixQuery.entriesToGen !== false) {
        const res = await this.processUndefinedEntries();
        if (!res.success) return res;
      }
      if (this.ctx.fixQuery.entriesToFill !== false) {
        return await this.fillMissingTranslations();
      }
      return {
        success: true,
        message: t("command.fix.nullWarn"),
        code: this.needFix ? EXECUTION_RESULT_CODE.Success : EXECUTION_RESULT_CODE.NoLackEntries
      };
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownFixError };
    }
  }

  private getIdByText(text: string) {
    return text.toLowerCase().replace(/[\s\\]/g, "");
  }

  private async processUndefinedEntries(): Promise<FixExecutionResult> {
    this.lackInfoFromUndefined = {};
    const referredLangCode = getLangCode(this.ctx.referredLang);
    const referredLangMap = this.ctx.langCountryMap[this.ctx.referredLang];
    const valueKeyMap = Object.keys(referredLangMap).reduce(
      (prev, cur) => ({ ...prev, [this.getIdByText(referredLangMap[cur])]: cur }),
      {} as Record<string, string>
    );
    const needTranslateList: TEntry[] = [];
    const patchedEntryIdList: (TEntry & { fixedRaw: string })[] = [];
    const undefinedEntryIdSet = new Set<string>();
    const entriesToGen = this.ctx.fixQuery.entriesToGen;
    const genScope = this.ctx.fixQuery.genScope;
    for (const entry of this.ctx.undefinedEntryList) {
      const nameInfo = entry.nameInfo;
      const entryId = this.getIdByText(nameInfo.text);
      if (this.ctx.i18nFramework === I18N_FRAMEWORK.none && nameInfo.vars.length > 0) continue;
      if (entriesToGen !== true) {
        if (entry.path === undefined || (genScope !== undefined && !genScope.includes(entry.path))) {
          continue;
        } else if (Array.isArray(entriesToGen) && entriesToGen.every(e => e !== entry.nameInfo.text)) {
          continue;
        }
      }
      if (this.ctx.matchExistingKey && valueKeyMap[entryId] && !entry.nameInfo.boundKey) {
        this.needFix = true;
        let entryKey = valueKeyMap[entryId];
        if (this.ctx.i18nFramework === I18N_FRAMEWORK.vueI18n) {
          const quoteMatch = entry.raw.match(/["'`]{1}/);
          const quote = quoteMatch ? `\\${quoteMatch[0]}` : "'";
          entryKey = convertKeyToVueI18nPath(entryKey, quote);
        }
        entry.nameInfo.boundKey = entryKey;
        patchedEntryIdList.push({ ...entry, fixedRaw: this.getFixedRaw(entry, entryKey) });
      } else if (undefinedEntryIdSet.has(entryId)) {
        patchedEntryIdList.push({ ...entry, fixedRaw: "" });
      } else {
        undefinedEntryIdSet.add(entryId);
        needTranslateList.push(entry);
      }
    }
    let genNameList: string[] = needTranslateList.map(entry => entry.nameInfo.text);
    if (genNameList.length > 0) {
      if (this.ctx.keyStrategy === KEY_STRATEGY.english) {
        if (referredLangCode !== "en" && this.ctx.fixQuery.fillWithOriginal !== true) {
          const res = await translateTo({
            source: this.ctx.referredLang,
            target: "en",
            sourceTextList: genNameList
          });
          if (res.success && res.data) {
            genNameList = res.data;
          } else {
            return {
              success: false,
              message: res.message ?? t("translator.noAvailableApi"),
              code: EXECUTION_RESULT_CODE.TranslatorFailed
            };
          }
        }
      } else if (this.ctx.keyStrategy === KEY_STRATEGY.pinyin) {
        genNameList = genNameList.map(name => pinyin.convertToPinyin(name));
      }
    }
    let namePrefix = "";
    if (this.ctx.keyPrefix === "auto-popular") {
      const pcList = this.getPopularClassList();
      namePrefix = pcList[0]?.name ?? "";
    } else if (this.ctx.keyPrefix === "manual-selection") {
      if (this.ctx.missingEntryFile) {
        if (this.ctx.namespaceStrategy === NAMESPACE_STRATEGY.full) {
          namePrefix = `${this.ctx.missingEntryFile}.`;
        } else if (this.ctx.namespaceStrategy === NAMESPACE_STRATEGY.file) {
          namePrefix = `${this.ctx.missingEntryFile.replace(/^.*\./, "")}.`;
        }
      }
      namePrefix += this.ctx.missingEntryPath;
    } else if (this.ctx.keyPrefix && this.ctx.keyPrefix !== "none") {
      namePrefix = this.ctx.keyPrefix;
    }
    const newIdSet = new Set<string>();
    const checkExisted = (key: string) => Boolean(getValueByAmbiguousEntryName(this.ctx.entryTree, key)) || newIdSet.has(key);
    needTranslateList.forEach((entry, index) => {
      if (genNameList[index] === "") return;
      const genKeyInfo = { keyStyle: this.ctx.keyStyle, stopWords: this.ctx.stopWords };
      const id = getIdByStr(genNameList[index], genKeyInfo);
      const nameInfo = entry.nameInfo;
      if (!nameInfo.boundKey) {
        let baseName = nameInfo.boundPrefix || namePrefix;
        if (baseName && !baseName.endsWith(this.ctx.nameSeparator) && !baseName.endsWith(".")) {
          baseName += this.ctx.nameSeparator;
        }
        const maxLen = this.ctx.maxKeyLength;
        let entryKey = baseName + id;
        const needsAnotherName = id.length > maxLen || id.length === 0 || checkExisted(entryKey);
        if (needsAnotherName) {
          let nameParts = [entryKey];
          if (!checkExisted(entryKey)) {
            const fileName = entry.path!.match(/([a-zA-Z0-9_-]+)\./)?.[1] ?? "unknown";
            const fileNameSplit = splitFileName(fileName).filter(item => !this.ctx.stopWords.includes(item));
            nameParts = [...fileNameSplit, "text"];
          }
          let index = 1;
          const keyLen = maxLen - baseName.length;
          entryKey = baseName + generateKey([...nameParts, String(index).padStart(2, "0")], genKeyInfo.keyStyle).slice(-keyLen);
          while (checkExisted(entryKey)) {
            index++;
            entryKey = baseName + generateKey([...nameParts, String(index).padStart(2, "0")], genKeyInfo.keyStyle).slice(-keyLen);
          }
        }
        nameInfo.boundKey = entryKey;
        newIdSet.add(entryKey);
      }
      patchedEntryIdList.push({ ...entry, fixedRaw: this.getFixedRaw(entry, nameInfo.boundKey) });
      this.needFix = true;
      referredLangMap[nameInfo.boundKey] = nameInfo.text;
      let fullPath = nameInfo.boundKey;
      if (this.ctx.missingEntryFile) {
        if (this.ctx.namespaceStrategy === NAMESPACE_STRATEGY.none) {
          fullPath = `${this.ctx.missingEntryFile}.${nameInfo.boundKey}`;
        } else if (this.ctx.namespaceStrategy === NAMESPACE_STRATEGY.file) {
          fullPath = `${this.ctx.missingEntryFile}.${nameInfo.boundKey.replace(/^.*?\./, "")}`;
        }
      }
      this.ctx.langDictionary[nameInfo.boundKey] ??= {
        fullPath,
        fileScope: this.ctx.missingEntryFile,
        value: {
          [this.ctx.referredLang]: nameInfo.text
        }
      };
      const filledScope = [this.ctx.referredLang];
      if (this.ctx.keyStrategy === KEY_STRATEGY.english) {
        const enLang = this.detectedLangList.find(item => getLangCode(item) === "en")!;
        filledScope.push(enLang);
      }
      if (this.ctx.fixQuery.entriesToFill === false) {
        this.ctx.fixQuery.entriesToFill = [nameInfo.boundKey];
        if (this.ctx.keyGenerationFillScope === KEY_GENERATION_FILL_SCOPE.minimal) {
          this.ctx.fixQuery.fillScope = filledScope;
        }
      } else if (Array.isArray(this.ctx.fixQuery.entriesToFill) && !this.ctx.fixQuery.entriesToFill.includes(nameInfo.boundKey)) {
        this.ctx.fixQuery.entriesToFill.push(nameInfo.boundKey);
      }
      const updatePayload: I18nUpdatePayload = {
        type: "add",
        key: nameInfo.boundKey,
        changes: {}
      };
      this.detectedLangList.forEach(lang => {
        if (filledScope.includes(lang)) {
          updatePayload.changes![lang] = { after: lang === this.ctx.referredLang ? nameInfo.text : genNameList[index] };
        } else {
          this.lackInfoFromUndefined[lang] ??= [];
          this.lackInfoFromUndefined[lang].push(nameInfo.boundKey);
        }
      });
      this.ctx.updatePayloads.push(updatePayload);
    });
    patchedEntryIdList.forEach(entry => {
      if (entry.fixedRaw === "") {
        const fixedEntryId =
          patchedEntryIdList.find(
            item => this.getIdByText(item.nameInfo.text) === this.getIdByText(entry.nameInfo.text) && item.fixedRaw.length > 0
          )?.nameInfo.boundKey ?? entry.nameInfo.text;
        entry.nameInfo.boundKey = fixedEntryId;
        entry.fixedRaw = this.getFixedRaw(entry, fixedEntryId);
      }
      const relativePath = toRelativePath(entry.path as string);
      this.ctx.patchedEntryIdInfo[relativePath] ??= [];
      this.ctx.patchedEntryIdInfo[relativePath].push({
        id: this.getIdByText(entry.nameInfo.text),
        raw: entry.raw,
        fixedRaw: entry.fixedRaw
      });
    });
    if (patchedEntryIdList.length > 0) {
      this.patchedNum = patchedEntryIdList.length;
      NotificationManager.showProgress({
        message: t(
          "command.fix.undefinedEntriesPatched",
          patchedEntryIdList.length,
          patchedEntryIdList.map(item => item.nameInfo.text).join(", ")
        ),
        type: "success"
      });
    }
    return {
      success: true,
      message: "",
      code: EXECUTION_RESULT_CODE.Success,
      data: {
        success: 0,
        failed: 0,
        generated: 0,
        total: 0,
        patched: this.patchedNum
      }
    };
  }

  private async fillMissingTranslations(): Promise<FixExecutionResult> {
    const lackInfo = { ...this.lackInfoFromUndefined };
    Object.keys(this.ctx.lackInfo).forEach(lang => {
      if (Object.hasOwn(lackInfo, lang)) {
        lackInfo[lang] = [...new Set([...lackInfo[lang], ...this.ctx.lackInfo[lang]])];
      } else {
        lackInfo[lang] = this.ctx.lackInfo[lang];
      }
    });
    if (this.ctx.autoTranslateEmptyKey) {
      Object.keys(this.ctx.nullInfo).forEach(lang => {
        if (Object.hasOwn(lackInfo, lang)) {
          lackInfo[lang] = [...new Set([...lackInfo[lang], ...this.ctx.nullInfo[lang]])];
        } else {
          lackInfo[lang] = this.ctx.nullInfo[lang];
        }
      });
    }
    let successCount = 0;
    let failCount = 0;
    let addedCount = 0;
    const referredLangMap = this.ctx.langCountryMap[this.ctx.referredLang];
    const fillScope = this.ctx.fixQuery.fillScope ?? Object.keys(lackInfo);
    const steps = fillScope.filter(lang => Object.hasOwn(lackInfo, lang) && lackInfo[lang].some(key => referredLangMap[key])).length;
    for (const lang in lackInfo) {
      if (!fillScope.includes(lang)) continue;
      if (ExecutionContext.token.isCancellationRequested) {
        this.restoreLackInfo();
        return {
          success: false,
          message: "",
          code: EXECUTION_RESULT_CODE.Cancelled
        };
      }
      const lackEntries = lackInfo[lang].filter(
        key =>
          (!Array.isArray(this.ctx.fixQuery.entriesToFill) || this.ctx.fixQuery.entriesToFill.includes(key)) &&
          !!referredLangMap[key] &&
          lang !== this.ctx.referredLang
      );
      if (lackEntries.length > 0) {
        this.needFix = true;
        const referredEntriesText = lackEntries.map(key => referredLangMap[key]);
        if (this.ctx.fixQuery.fillWithOriginal === true) {
          lackEntries.forEach((key, index) => {
            addedCount++;
            this.ctx.updatePayloads.push({
              type: "fill",
              key,
              changes: {
                [lang]: { after: referredEntriesText[index] }
              }
            });
          });
        } else {
          const res = await translateTo({
            source: this.ctx.referredLang,
            target: lang,
            sourceTextList: referredEntriesText
          });
          if (res.success && res.data) {
            successCount++;
            lackEntries.forEach((key, index) => {
              addedCount++;
              this.ctx.updatePayloads.push({
                type: "fill",
                key,
                changes: {
                  [lang]: { after: res.data?.[index] }
                }
              });
            });
          } else {
            failCount++;
          }
          NotificationManager.showProgress({
            message: res.message,
            type: res.success ? "success" : "error",
            increment: (1 / steps) * 100
          });
        }
      }
    }
    let success = true;
    let message = "";
    let code = EXECUTION_RESULT_CODE.Success;
    if (!this.needFix) {
      message = t("command.fix.nullWarn");
      code = EXECUTION_RESULT_CODE.NoLackEntries;
    } else if (successCount === 0 && failCount === 0) {
      message = t("command.fix.existingUndefinedSuccess");
      code = EXECUTION_RESULT_CODE.Success;
    } else if (failCount === 0) {
      message = t("command.fix.translatorSuccess", successCount, addedCount);
      code = EXECUTION_RESULT_CODE.Success;
    } else if (successCount > 0) {
      message = t("command.fix.translatorPartialSuccess", successCount + failCount, successCount, addedCount, failCount);
      code = EXECUTION_RESULT_CODE.TranslatorPartialFailed;
    } else {
      success = false;
      message = t("command.fix.translatorFailed", successCount + failCount);
      code = EXECUTION_RESULT_CODE.TranslatorFailed;
    }
    return new Promise<FixExecutionResult>(resolve => {
      setTimeout(() => {
        resolve({
          success,
          message,
          code,
          data: {
            success: successCount,
            failed: failCount,
            generated: addedCount,
            total: successCount + failCount,
            patched: this.patchedNum
          }
        });
      }, 1500);
    });
  }

  private restoreLackInfo(): void {
    [...new Set(Object.values(this.lackInfoFromUndefined).flat())].forEach(key => {
      if (Object.hasOwn(this.ctx.langDictionary, key)) {
        delete this.ctx.langDictionary[key];
      }
    });
    for (const lang in this.lackInfoFromUndefined) {
      if (Object.hasOwn(this.ctx.lackInfo, lang)) {
        const undefinedEntries = this.lackInfoFromUndefined[lang];
        this.ctx.lackInfo[lang] = this.ctx.lackInfo[lang].filter(item => !undefinedEntries.includes(item));
      }
    }
    for (const lang in this.ctx.nullInfo) {
      if (Object.hasOwn(this.ctx.lackInfo, lang)) {
        this.ctx.lackInfo[lang] = this.ctx.lackInfo[lang].filter(item => !this.ctx.nullInfo[lang].includes(item));
      }
    }
  }

  private getFixedRaw(entry: TEntry, key: string): string {
    const displayName = internalToDisplayName(unescapeString(key));
    let varStr = "";
    if (entry.vars.length > 0) {
      varStr = ", " + entry.vars.join(", ");
    } else if (entry.nameInfo.vars.length > 0) {
      const varList = entry.nameInfo.vars;
      switch (this.ctx.i18nFramework) {
        case I18N_FRAMEWORK.vueI18n:
          varStr = ", [" + varList.join(", ") + "]";
          break;
        case I18N_FRAMEWORK.vscodeL10n:
          varStr = ", " + varList.join(", ");
          break;
        default:
          varStr = ", { " + varList.map((item, index) => `${index}: ${item}`).join(", ") + " }";
          break;
      }
    }
    const quote = entry.raw.slice(1).match(/["'`]{1}/)?.[0] ?? '"';
    const funcName = entry.raw.match(/^([^]+?)\(/)?.[1] ?? "";
    return funcName ? `${funcName}(${quote}${displayName}${quote}${varStr})` : `${quote}${displayName}${quote}`;
  }

  private getPopularClassMap(tree: EntryClassTreeItem, map: Record<string, number> = {}, classPrefix: string = ""): Record<string, number> {
    for (const [key, value] of Object.entries(tree)) {
      const itemName = classPrefix + key + this.ctx.nameSeparator;
      if (value !== null && value !== undefined) {
        map[itemName] = Object.keys(value).length;
        this.getPopularClassMap(value, map, itemName);
      }
    }
    return map;
  }

  private getPopularClassList(): Array<{ name: string; value: number }> {
    const classTree = this.ctx.entryClassTree.find((item, index) =>
      this.ctx.missingEntryFile ? item.filePos === this.ctx.missingEntryFile : index === 0
    );
    if (classTree === undefined) return [];
    const map = this.getPopularClassMap(classTree.data);
    return Object.keys(map)
      .sort((a, b) => (map[a] > map[b] ? -1 : 1))
      .map(item => ({ name: item, value: map[item] }));
  }
}
