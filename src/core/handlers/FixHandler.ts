import { LangContextInternal, LackInfo } from "@/types";
import { getLangCode } from "@/utils/langKey";
import { TEntry, I18N_FRAMEWORK } from "@/types";
import {
  validateLang,
  getIdByStr,
  getValueByAmbiguousEntryName,
  escapeString,
  internalToDisplayName,
  generateKey,
  unescapeString,
  convertKeyToVueI18nPath,
  // getFileLocationFromId,
  splitFileName
} from "@/utils/regex";
import { getDetectedLangList, setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import translateTo from "@/translator/index";
import { t } from "@/utils/i18n";
import { ExecutionContext } from "@/utils/context";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";
import { NotificationManager } from "@/utils/notification";

export class FixHandler {
  private lackInfoFromUndefined: LackInfo;
  private needFix: boolean = false;
  constructor(private ctx: LangContextInternal) {
    this.lackInfoFromUndefined = {};
  }

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public async run(): Promise<ExecutionResult> {
    try {
      this.needFix = false;
      if (!this.ctx.referredLang) {
        return {
          success: false,
          message: t("command.fix.noReferredLang"),
          code: EXECUTION_RESULT_CODE.NoReferredLang
        };
      }
      if (this.ctx.undefinedEntryList.length > 0) {
        const res = await this.processUndefinedEntries();
        if (!res.success) return res;
      }
      const res = await this.fillMissingTranslations();
      if (ExecutionContext.token.isCancellationRequested) {
        this.restoreLackInfo();
        return { success: false, message: "", code: EXECUTION_RESULT_CODE.Cancelled };
      }
      return res;
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownFixError };
    }
  }

  private getIdByText(text: string) {
    return text.toLowerCase().replace(/[\s\\]/g, "");
  }

  private async processUndefinedEntries(): Promise<ExecutionResult> {
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
    for (const entry of this.ctx.undefinedEntryList) {
      const nameInfo = entry.nameInfo;
      const entryId = this.getIdByText(nameInfo.text);
      if (this.ctx.i18nFramework === I18N_FRAMEWORK.none && nameInfo.vars.length > 0) continue;
      if (this.ctx.matchExistingKey && valueKeyMap[entryId] && !entry.nameInfo.boundName) {
        this.needFix = true;
        let entryName = valueKeyMap[entryId];
        if (this.ctx.i18nFramework === I18N_FRAMEWORK.vueI18n) {
          const quoteMatch = entry.raw.match(/["'`]{1}/);
          const quote = quoteMatch ? `\\${quoteMatch[0]}` : "'";
          entryName = convertKeyToVueI18nPath(entryName, quote);
        }
        entryName = unescapeString(entryName);
        entry.nameInfo.boundName = entryName;
        patchedEntryIdList.push({ ...entry, fixedRaw: this.getFixedRaw(entry, entryName) });
      } else if (undefinedEntryIdSet.has(entryId)) {
        patchedEntryIdList.push({ ...entry, fixedRaw: "" });
      } else if (
        this.ctx.autoTranslateMissingKey &&
        (!this.ctx.validateLanguageBeforeTranslate || validateLang(nameInfo.text, this.ctx.referredLang))
      ) {
        undefinedEntryIdSet.add(entryId);
        needTranslateList.push(entry);
      }
    }
    let enNameList: string[] = needTranslateList.map(entry => entry.nameInfo.text);
    const enLang = this.detectedLangList.find(item => getLangCode(item) === "en")!;
    if (enNameList.length > 0) {
      if (referredLangCode !== "en") {
        const res = await translateTo({
          source: this.ctx.referredLang,
          target: "en",
          sourceTextList: enNameList
        });
        if (res.success && res.data) {
          enNameList = res.data;
        } else {
          return {
            success: false,
            message: res.message ?? t("translator.noAvailableApi"),
            code: EXECUTION_RESULT_CODE.TranslatorFailed
          };
        }
      }
    }
    const pcList = this.getPopularClassList();
    let namePrefix = "";
    if (this.ctx.keyPrefix === "auto-popular") {
      namePrefix = pcList[0]?.name ?? "";
    } else if (this.ctx.keyPrefix && this.ctx.keyPrefix !== "none") {
      namePrefix = this.ctx.keyPrefix;
    }
    const newIdSet = new Set<string>();
    const checkExisted = (key: string) => Boolean(getValueByAmbiguousEntryName(this.ctx.entryTree, key)) || newIdSet.has(key);
    needTranslateList.forEach((entry, index) => {
      if (enNameList[index] === "") return;
      const genKeyInfo = { keyStyle: this.ctx.generatedKeyStyle, stopWords: this.ctx.stopWords };
      const id = getIdByStr(enNameList[index], genKeyInfo);
      const nameInfo = entry.nameInfo;
      if (!nameInfo.boundName) {
        if (nameInfo.boundClass && !nameInfo.boundClass.endsWith(this.ctx.nameSeparator)) {
          nameInfo.boundClass += this.ctx.nameSeparator;
        }
        const baseName = nameInfo.boundClass || namePrefix;
        const maxLen = this.ctx.maxGeneratedKeyLength;
        let entryName = baseName + id;
        const needsAnotherName = entryName.length > maxLen || id.length === 0 || checkExisted(entryName);
        if (needsAnotherName) {
          let nameParts = [entryName];
          if (!checkExisted(entryName)) {
            const fileName = entry.path!.match(/([a-zA-Z0-9_-]+)\./)?.[1] ?? "unknown";
            const fileNameSplit = splitFileName(fileName).filter(item => !this.ctx.stopWords.includes(item));
            nameParts = [...fileNameSplit, "text"];
          }
          let index = 1;
          const keyLen = maxLen - baseName.length;
          entryName = baseName + generateKey([...nameParts, String(index).padStart(2, "0")], genKeyInfo.keyStyle).slice(-keyLen);
          while (checkExisted(entryName)) {
            index++;
            entryName = baseName + generateKey([...nameParts, String(index).padStart(2, "0")], genKeyInfo.keyStyle).slice(-keyLen);
          }
        }
        nameInfo.boundName = entryName;
        newIdSet.add(entryName);
      }
      // const structure = this.ctx.fileStructure?.children?.[this.ctx.referredLang];
      // if (this.ctx.multiFileMode > 0 && structure && getFileLocationFromId(nameInfo.boundName, structure) === null) {
      //   nameInfo.boundName = this.ctx.defaultFilePos + nameInfo.boundName;
      // }
      patchedEntryIdList.push({ ...entry, fixedRaw: this.getFixedRaw(entry, nameInfo.boundName) });
      this.needFix = true;
      if (this.ctx.multiFileMode === 0 && this.ctx.nestedLocale === 0) {
        nameInfo.boundName = escapeString(nameInfo.boundName);
      }
      referredLangMap[nameInfo.boundName] = nameInfo.text;
      this.ctx.langDictionary[nameInfo.boundName] ??= {
        fullPath: `${this.ctx.defaultFilePos}.${nameInfo.boundName}}`,
        fileScope: this.ctx.defaultFilePos,
        value: {
          [this.ctx.referredLang]: nameInfo.text
        }
      };
      this.detectedLangList.forEach(lang => {
        if ([this.ctx.referredLang, enLang].includes(lang)) {
          setUpdatedEntryValueInfo(this.ctx, nameInfo.boundName, lang === this.ctx.referredLang ? nameInfo.text : enNameList[index], lang);
        } else {
          this.lackInfoFromUndefined[lang] ??= [];
          this.lackInfoFromUndefined[lang].push(nameInfo.boundName);
        }
      });
    });
    this.ctx.patchedEntryIdInfo = {};
    patchedEntryIdList.forEach(entry => {
      if (entry.fixedRaw === "") {
        const fixedEntryId =
          patchedEntryIdList.find(
            item => this.getIdByText(item.nameInfo.text) === this.getIdByText(entry.nameInfo.text) && item.fixedRaw.length > 0
          )?.nameInfo.boundName ?? entry.nameInfo.text;
        entry.nameInfo.boundName = fixedEntryId;
        entry.fixedRaw = this.getFixedRaw(entry, fixedEntryId);
      }
      this.ctx.patchedEntryIdInfo[entry.path as string] ??= [];
      this.ctx.patchedEntryIdInfo[entry.path as string].push({
        id: this.getIdByText(entry.nameInfo.text),
        raw: entry.raw,
        fixedRaw: entry.fixedRaw
      });
    });
    if (patchedEntryIdList.length > 0) {
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
      code: EXECUTION_RESULT_CODE.Success
    };
  }

  private async fillMissingTranslations(): Promise<ExecutionResult> {
    for (const lang in this.lackInfoFromUndefined) {
      if (Object.hasOwn(this.ctx.lackInfo, lang)) {
        this.ctx.lackInfo[lang].push(...this.lackInfoFromUndefined[lang]);
      } else {
        this.ctx.lackInfo[lang] = this.lackInfoFromUndefined[lang];
      }
    }
    if (this.ctx.autoTranslateEmptyKey) {
      for (const lang in this.ctx.nullInfo) {
        if (Object.hasOwn(this.ctx.lackInfo, lang)) {
          this.ctx.lackInfo[lang].push(...this.ctx.nullInfo[lang]);
        } else {
          this.ctx.lackInfo[lang] = this.ctx.nullInfo[lang];
        }
      }
    }
    let successCount = 0;
    let failCount = 0;
    let addedCount = 0;
    const referredLangMap = this.ctx.langCountryMap[this.ctx.referredLang];
    const steps = Object.values(this.ctx.lackInfo).filter(keys => keys.some(key => referredLangMap[key])).length;
    for (const lang in this.ctx.lackInfo) {
      if (ExecutionContext.token.isCancellationRequested) {
        this.restoreLackInfo();
        return { success: false, message: "", code: EXECUTION_RESULT_CODE.Cancelled };
      }
      const lackEntries = this.ctx.lackInfo[lang].filter(key => referredLangMap[key]);
      if (lackEntries.length > 0) {
        this.needFix = true;
        const referredEntriesText = lackEntries.map(key => referredLangMap[key]);
        const res = await translateTo({
          source: this.ctx.referredLang,
          target: lang,
          sourceTextList: referredEntriesText
        });
        if (res.success && res.data) {
          successCount++;
          lackEntries.forEach((entryName, index) => {
            addedCount++;
            setUpdatedEntryValueInfo(this.ctx, entryName, res.data?.[index], lang);
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
    return new Promise<ExecutionResult>(resolve => {
      setTimeout(() => {
        // this.restoreLackInfo();
        resolve({ success, message, code });
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

  private getFixedRaw(entry: TEntry, name: string): string {
    const displayName = internalToDisplayName(name);
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

  private getPopularClassMap(
    tree: Record<string, object>,
    map: Record<string, number> = {},
    classPrefix: string = ""
  ): Record<string, number> {
    for (const [key, value] of Object.entries(tree)) {
      const itemName = classPrefix + key + this.ctx.nameSeparator;
      if (value !== null && value !== undefined) {
        map[itemName] = Object.keys(value).length;
        this.getPopularClassMap(value as Record<string, object>, map, itemName);
      }
    }
    return map;
  }

  private getPopularClassList(): Array<{ name: string; value: number }> {
    const map = this.getPopularClassMap(this.ctx.entryClassTree);
    return Object.keys(map)
      .sort((a, b) => (map[a] > map[b] ? -1 : 1))
      .map(item => ({ name: item, value: map[item] }));
  }
}
