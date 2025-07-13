import { LangContextInternal, LackInfo } from "@/types";
import { CheckHandler } from "./CheckHandler";
import { RewriteHandler } from "./RewriteHandler";
import { LANG_FORMAT_TYPE, LANG_ENTRY_SPLIT_SYMBOL, getLangCode } from "@/utils/langKey";
import { TEntry, I18N_FRAMEWORK } from "@/types";
import { validateLang, getIdByStr, getValueByAmbiguousEntryName, escapeString } from "@/utils/regex";
import { getDetectedLangList, setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import translateTo from "@/translator/index";
import { t } from "@/utils/i18n";
import { ExecutionContext } from "@/utils/context";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";

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
      const checker = new CheckHandler(this.ctx);
      checker.run();
      if (this.ctx.undefinedEntryList.length > 0) {
        const res = await this.processUndefinedEntries();
        if (!res.success) return res;
      }
      const res = await this.fillMissingTranslations();
      if (ExecutionContext.token.isCancellationRequested) {
        return { success: false, message: t("common.progress.cancelledByUser"), code: EXECUTION_RESULT_CODE.Cancelled };
      }
      if (this.ctx.rewriteFlag && res.success && res.message === "") {
        const writer = new RewriteHandler(this.ctx);
        return await writer.run();
      }
      return res;
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownFixError };
    }
  }

  private async processUndefinedEntries(): Promise<ExecutionResult> {
    this.lackInfoFromUndefined = {};
    const referredLangCode = getLangCode(this.ctx.referredLang);
    const referredLangMap = this.ctx.langCountryMap[this.ctx.referredLang];
    const valueKeyMap = Object.keys(referredLangMap).reduce(
      (prev, cur) => ({ ...prev, [getIdByStr(referredLangMap[cur])]: cur }),
      {} as Record<string, string>
    );
    const needTranslateList: TEntry[] = [];
    const patchedEntryIdList: (TEntry & { fixedRaw: string })[] = [];
    const undefinedEntryIdSet = new Set<string>();
    this.ctx.undefinedEntryList.forEach(entry => {
      const nameInfo = entry.nameInfo;
      if (valueKeyMap[nameInfo.id]) {
        this.needFix = true;
        const entryName = valueKeyMap[nameInfo.id];
        entry.nameInfo.boundName = entryName;
        patchedEntryIdList.push({ ...entry, fixedRaw: this.getFixedRaw(entry, entryName) });
      } else if (undefinedEntryIdSet.has(nameInfo.id)) {
        patchedEntryIdList.push({ ...entry, fixedRaw: "" });
      } else if (validateLang(nameInfo.text, getLangCode(this.ctx.referredLang) ?? this.ctx.referredLang)) {
        undefinedEntryIdSet.add(nameInfo.id);
        needTranslateList.push(entry);
      }
    });
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
            message: t("command.fix.translatorFailed"),
            code: EXECUTION_RESULT_CODE.TranslatorFailed
          };
        }
      }
    }
    const pcList = this.getPopularClassList();
    const namePrefix = pcList[0]?.name ?? "";
    const newIdSet = new Set<string>();
    const checkExisted = (key: string) => Boolean(getValueByAmbiguousEntryName(this.ctx.entryTree, key)) || newIdSet.has(key);
    needTranslateList.forEach((entry, index) => {
      let id = getIdByStr(enNameList[index], true);
      const nameInfo = entry.nameInfo;
      if (!nameInfo.boundName || checkExisted(nameInfo.boundName)) {
        if (nameInfo.boundClass && !nameInfo.boundClass.endsWith(LANG_ENTRY_SPLIT_SYMBOL[this.ctx.langFormatType] as string)) {
          nameInfo.boundClass += LANG_ENTRY_SPLIT_SYMBOL[this.ctx.langFormatType];
        }
        const baseName = nameInfo.boundClass || namePrefix;
        const needsNewId = id.length > 40 || checkExisted(baseName + id);
        if (needsNewId) {
          const mainName = id.length > 40 ? entry.path!.match(/([a-zA-Z0-9]+)\./)?.[1] + "Text" : id;
          let index = 1;
          while (checkExisted(`${baseName}${mainName}${String(index).padStart(2, "0")}`)) {
            index++;
          }
          id = `${mainName}${String(index).padStart(2, "0")}`;
        }
        nameInfo.boundName = baseName + id;
        newIdSet.add(nameInfo.boundName);
      }
      patchedEntryIdList.push({ ...entry, fixedRaw: this.getFixedRaw(entry, nameInfo.boundName) });
      this.needFix = true;
      if (this.ctx.isFlat) {
        nameInfo.boundName = escapeString(nameInfo.boundName);
      }
      referredLangMap[nameInfo.boundName] = nameInfo.text;
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
          patchedEntryIdList.find(item => item.nameInfo.id === entry.nameInfo.id && item.fixedRaw.length > 0)?.nameInfo.boundName ??
          entry.nameInfo.text;
        entry.nameInfo.boundName = fixedEntryId;
        entry.fixedRaw = this.getFixedRaw(entry, fixedEntryId);
      }
      this.ctx.patchedEntryIdInfo[entry.path as string] ??= [];
      this.ctx.patchedEntryIdInfo[entry.path as string].push({ id: entry.nameInfo.id, raw: entry.raw, fixedRaw: entry.fixedRaw });
    });
    return {
      success: true,
      message: "",
      code: EXECUTION_RESULT_CODE.Success
    };
  }

  private async fillMissingTranslations(): Promise<ExecutionResult> {
    let hasTranslatorFailed = false;
    for (const lang in this.lackInfoFromUndefined) {
      if (Object.hasOwn(this.ctx.lackInfo, lang)) {
        this.ctx.lackInfo[lang].push(...this.lackInfoFromUndefined[lang]);
      } else {
        this.ctx.lackInfo[lang] = this.lackInfoFromUndefined[lang];
      }
    }
    for (const lang in this.ctx.lackInfo) {
      if (ExecutionContext.token.isCancellationRequested) {
        return { success: false, message: t("common.progress.cancelledByUser"), code: EXECUTION_RESULT_CODE.Cancelled };
      }
      const referredLangMap = this.ctx.langCountryMap[this.ctx.referredLang];
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
          lackEntries.forEach((entryName, index) => {
            setUpdatedEntryValueInfo(this.ctx, entryName, res.data?.[index], lang);
          });
        } else {
          hasTranslatorFailed = true;
        }
      }
    }
    let message = "";
    let code = EXECUTION_RESULT_CODE.Success;
    if (!this.needFix) {
      message = t("command.fix.nullWarn");
      code = EXECUTION_RESULT_CODE.NoLackEntries;
    } else if (hasTranslatorFailed) {
      message = t("command.fix.translatorFailed");
      code = EXECUTION_RESULT_CODE.TranslatorFailed;
    }
    return { success: true, message, code };
  }

  private getFixedRaw(entry: TEntry, name: string): string {
    if (this.ctx.langFormatType === LANG_FORMAT_TYPE.nonObj) {
      return name;
    } else {
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
      const quote = entry.raw.match(/["'`]{1}/)![0];
      return `${entry.raw[0]}t(${quote}${name}${quote}${varStr})`;
    }
  }

  private getPopularClassMap(
    tree: Record<string, object>,
    map: Record<string, number> = {},
    classPrefix: string = ""
  ): Record<string, number> {
    const splitSymbol = LANG_ENTRY_SPLIT_SYMBOL[this.ctx.langFormatType] as string;
    for (const [key, value] of Object.entries(tree)) {
      const itemName = classPrefix + key + splitSymbol;
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
