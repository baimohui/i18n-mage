import type { I18nFramework, LangContextInternal, LangContextPublic, QuoteStyle, SortMode } from "@/types";
import { createLangContext } from "@/core/context";
import { CheckHandler } from "./handlers/CheckHandler";
import { FixHandler } from "./handlers/FixHandler";
import { RewriteHandler } from "./handlers/RewriteHandler";
import { ImportHandler } from "./handlers/ImportHandler";
import { ExportHandler } from "./handlers/ExportHandler";
import { SortHandler } from "./handlers/SortHandler";
import { TrimHandler } from "./handlers/TrimHandler";
import { ModifyHandler } from "./handlers/ModifyHandler";
import { ReadHandler } from "./handlers/ReadHandler";
import { LangMageOptions, ExecutionResult, EXECUTION_RESULT_CODE, KeyStyle } from "@/types";
import { getDetectedLangList } from "@/core/tools/contextTools";
import { getLangCode } from "@/utils/langKey";
import { t } from "@/utils/i18n";
import { getConfig } from "@/utils/config";

class LangMage {
  private static instance: LangMage;
  private ctx: LangContextInternal;

  private constructor(options?: LangMageOptions) {
    this.ctx = createLangContext();
    this.setOptions(options);
  }

  public static getInstance(): LangMage {
    if (LangMage.instance == null) {
      LangMage.instance = new LangMage();
    }
    return LangMage.instance;
  }

  public setOptions(options: LangMageOptions = {}): void {
    if (Object.prototype.toString.call(options) === "[object Object]") {
      const combinedOptions: LangMageOptions = {
        referredLang: getConfig<string>("translationServices.referenceLanguage", this.ctx.referredLang),
        displayLang: getConfig<string>("general.displayLanguage", this.ctx.displayLang),
        i18nFramework: getConfig<I18nFramework>("i18nFeatures.framework", this.ctx.i18nFramework),
        ignoredLangs: getConfig<string[]>("workspace.ignoredLanguages", this.ctx.ignoredLangs),
        manuallyMarkedUsedEntries: getConfig<string[]>("workspace.manuallyMarkedUsedEntries", this.ctx.manuallyMarkedUsedEntries),
        syncBasedOnReferredEntries: getConfig<boolean>("general.syncBasedOnReferredEntries", this.ctx.syncBasedOnReferredEntries),
        sortingWriteMode: getConfig<SortMode>("writeRules.sortOnWrite", this.ctx.sortingWriteMode),
        sortingExportMode: getConfig<SortMode>("general.sortOnExport", this.ctx.sortingExportMode),
        matchExistingKey: getConfig<boolean>("translationServices.matchExistingKey", this.ctx.matchExistingKey),
        autoTranslateMissingKey: getConfig<boolean>("translationServices.autoTranslateMissingKey", this.ctx.autoTranslateMissingKey),
        generatedKeyStyle: getConfig<KeyStyle>("writeRules.generatedKeyStyle", this.ctx.generatedKeyStyle),
        stopWords: getConfig<string[]>("writeRules.stopWords", this.ctx.stopWords),
        maxGeneratedKeyLength: getConfig<number>("writeRules.maxGeneratedKeyLength", this.ctx.maxGeneratedKeyLength),
        keyPrefix: getConfig<string>("writeRules.keyPrefix", this.ctx.keyPrefix),
        languageFileIndent: getConfig<number>("writeRules.languageFileIndent", this.ctx.languageFileIndent),
        quoteStyleForKey: getConfig<"auto" | QuoteStyle>("writeRules.quoteStyleForKey", this.ctx.quoteStyleForKey),
        quoteStyleForValue: getConfig<"auto" | QuoteStyle>("writeRules.quoteStyleForValue", this.ctx.quoteStyleForValue),
        checkUsageWithStringLiterals: getConfig<boolean>("general.checkUsageWithStringLiterals", this.ctx.checkUsageWithStringLiterals),
        validateLanguageBeforeTranslate: getConfig<boolean>(
          "translationServices.validateLanguageBeforeTranslate",
          this.ctx.validateLanguageBeforeTranslate
        ),
        ...options
      };
      for (const [key, value] of Object.entries(combinedOptions)) {
        if (Object.hasOwn(this.ctx, key)) {
          this.ctx[key] = value as string;
        }
      }
    }
  }

  public async execute(options: LangMageOptions | null = null): Promise<ExecutionResult> {
    if (!this.ctx.isVacant) {
      return { success: true, message: t("common.progress.processing"), code: EXECUTION_RESULT_CODE.Processing };
    }
    try {
      this.ctx.isVacant = false;
      console.time("elapsed");
      if (options) this.setOptions(options);
      if (this.ctx.clearCache) this.reset();
      const reader = new ReadHandler(this.ctx);
      reader.readLangFiles();
      if (this.detectedLangList.length === 0) {
        return { success: true, message: t("common.noLangPathDetectedWarn"), code: EXECUTION_RESULT_CODE.NoLangPathDetected };
      }
      const resolveLang = (target: string, isValidCode = false) => {
        const targetCode = getLangCode(target);
        const defaultCode = getLangCode(this.ctx.defaultLang);
        return (
          this.detectedLangList.find(lang => lang === target) ??
          this.detectedLangList.find(lang => getLangCode(lang) === targetCode) ??
          this.detectedLangList.find(lang => getLangCode(lang) === defaultCode) ??
          this.detectedLangList.find(lang => getLangCode(lang) === "en") ??
          this.detectedLangList.find(lang => (isValidCode ? getLangCode(lang) !== null : Boolean(lang))) ??
          ""
        );
      };
      this.ctx.referredLang = resolveLang(this.ctx.referredLang, true);
      this.ctx.displayLang = resolveLang(this.ctx.displayLang);

      if (this.ctx.globalFlag) {
        reader.startCensus();
      }
      let res = { success: true, message: "", code: EXECUTION_RESULT_CODE.Success };
      switch (this.ctx.task) {
        case "check":
          res = new CheckHandler(this.ctx).run();
          break;
        case "fix":
          res = await new FixHandler(this.ctx).run();
          break;
        case "export":
          res = new ExportHandler(this.ctx).run();
          break;
        case "import":
          res = await new ImportHandler(this.ctx).run();
          break;
        case "sort":
          res = await new SortHandler(this.ctx).run();
          break;
        case "modify":
          res = await new ModifyHandler(this.ctx).run();
          break;
        case "trim":
          await new TrimHandler(this.ctx).run();
          break;
        case "rewrite":
          res = await new RewriteHandler(this.ctx).run();
          break;
      }
      return res;
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      console.error(e);
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownError };
    } finally {
      this.ctx.isVacant = true;
      console.timeEnd("elapsed");
    }
  }

  public getPublicContext(): LangContextPublic {
    return {
      task: this.ctx.task,
      langPath: this.ctx.langPath,
      langFileType: this.ctx.langFileType,
      projectPath: this.ctx.projectPath,
      referredLang: this.ctx.referredLang,
      displayLang: this.ctx.displayLang,
      defaultLang: this.ctx.defaultLang,
      ignoredLangs: this.ctx.ignoredLangs,
      globalFlag: this.ctx.globalFlag,
      rewriteFlag: this.ctx.rewriteFlag,
      exportDir: this.ctx.exportDir,
      cachePath: this.ctx.cachePath,
      sortingWriteMode: this.ctx.sortingWriteMode,
      sortingExportMode: this.ctx.sortingExportMode,
      styleScore: this.ctx.styleScore,
      fileStructure: this.ctx.fileStructure,
      syncBasedOnReferredEntries: this.ctx.syncBasedOnReferredEntries,
      manuallyMarkedUsedEntries: this.ctx.manuallyMarkedUsedEntries,
      modifyList: this.ctx.modifyList,
      i18nFramework: this.ctx.i18nFramework,
      matchExistingKey: this.ctx.matchExistingKey,
      autoTranslateMissingKey: this.ctx.autoTranslateMissingKey,
      generatedKeyStyle: this.ctx.generatedKeyStyle,
      stopWords: this.ctx.stopWords,
      maxGeneratedKeyLength: this.ctx.maxGeneratedKeyLength,
      keyPrefix: this.ctx.keyPrefix,
      languageFileIndent: this.ctx.languageFileIndent,
      quoteStyleForKey: this.ctx.quoteStyleForKey,
      quoteStyleForValue: this.ctx.quoteStyleForValue,
      checkUsageWithStringLiterals: this.ctx.checkUsageWithStringLiterals,
      validateLanguageBeforeTranslate: this.ctx.validateLanguageBeforeTranslate
    };
  }

  public get detectedLangList(): string[] {
    return getDetectedLangList(this.ctx);
  }

  public get langDetail() {
    return {
      langList: Object.keys(this.ctx.langCountryMap),
      dictionary: this.ctx.langDictionary,
      lack: this.ctx.lackInfo,
      extra: this.ctx.extraInfo,
      null: this.ctx.nullInfo,
      countryMap: this.ctx.langCountryMap,
      used: this.ctx.usedEntryMap,
      undefined: this.ctx.undefinedEntryMap,
      usedKeySet: this.ctx.usedKeySet,
      unusedKeySet: this.ctx.unusedKeySet,
      isFlat: this.ctx.isFlat,
      tree: this.ctx.entryTree,
      updatedValues: this.ctx.updatedEntryValueInfo,
      patchedIds: this.ctx.patchedEntryIdInfo
    };
  }

  private reset(): void {
    this.ctx.langFileType = "";
    this.ctx.langDictionary = {};
    this.ctx.langCountryMap = {};
    this.ctx.lackInfo = {};
    this.ctx.extraInfo = {};
    this.ctx.nullInfo = {};
    this.ctx.singleLangRepeatTextInfo = {};
    this.ctx.multiLangRepeatTextInfo = {};
    this.ctx.entryClassTree = {};
    this.ctx.entryClassInfo = {};
    this.ctx.styleScore = 0;
    this.ctx.undefinedEntryList = [];
    this.ctx.undefinedEntryMap = {};
    this.ctx.usedEntryMap = {};
    this.ctx.langFileExtraInfo = {};
    this.ctx.usedKeySet = new Set();
    this.ctx.unusedKeySet = new Set();
    this.ctx.isFlat = true;
    this.ctx.isVacant = true;
    this.ctx.entryTree = {};
    this.ctx.updatedEntryValueInfo = {};
    this.ctx.patchedEntryIdInfo = {};
    this.ctx.nameSeparator = "";
  }
}

export default LangMage;
