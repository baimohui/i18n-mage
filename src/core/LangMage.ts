import type { LangContextInternal, LangContextPublic, SortMode } from "@/types";
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
import { LangMageOptions, I18nFramework, ExecutionResult, EXECUTION_RESULT_CODE, KeyStyle } from "@/types";
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
        ignoredFileList: getConfig<string[]>("workspace.ignoredFileList", this.ctx.ignoredFileList),
        langFileMinLength: getConfig<number>("general.langFileMinLength", this.ctx.langFileMinLength),
        ignoreEmptyLangFile: getConfig<boolean>("general.ignoreEmptyLangFile", this.ctx.ignoreEmptyLangFile),
        manuallyMarkedUsedEntries: getConfig<string[]>("workspace.manuallyMarkedUsedEntries", this.ctx.manuallyMarkedUsedEntries),
        syncBasedOnReferredEntries: getConfig<boolean>("general.syncBasedOnReferredEntries", this.ctx.syncBasedOnReferredEntries),
        sortingWriteMode: getConfig<SortMode>("general.sortOnWrite", this.ctx.sortingWriteMode),
        sortingExportMode: getConfig<SortMode>("general.sortOnExport", this.ctx.sortingExportMode),
        defaultNamespace: getConfig<string>("i18nFeatures.defaultNamespace", this.ctx.defaultNamespace),
        tFuncNames: getConfig<string[]>("i18nFeatures.translationFunctionNames", this.ctx.tFuncNames),
        namespaceSeparator: getConfig<"auto" | ":" | ".">("i18nFeatures.namespaceSeparator", this.ctx.namespaceSeparator),
        matchExistingKey: getConfig<boolean>("translationServices.matchExistingKey", this.ctx.matchExistingKey),
        autoTranslateMissingKey: getConfig<boolean>("translationServices.autoTranslateMissingKey", this.ctx.autoTranslateMissingKey),
        generatedKeyStyle: getConfig<KeyStyle>("translationServices.generatedKeyStyle", this.ctx.generatedKeyStyle),
        stopWords: getConfig<string[]>("translationServices.stopWords", this.ctx.stopWords),
        maxGeneratedKeyLength: getConfig<number>("translationServices.maxGeneratedKeyLength", this.ctx.maxGeneratedKeyLength),
        keyPrefix: getConfig<string>("translationServices.keyPrefix", this.ctx.keyPrefix),
        interpolationBrackets: getConfig<"auto" | "single" | "double">(
          "i18nFeatures.interpolationBrackets",
          this.ctx.interpolationBrackets
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

  public async execute(): Promise<ExecutionResult> {
    if (!this.ctx.isVacant) {
      return { success: true, message: t("common.progress.processing"), code: EXECUTION_RESULT_CODE.Processing };
    }
    try {
      this.ctx.isVacant = false;
      console.time("elapsed");
      if (this.ctx.clearCache) this.reset();
      const reader = new ReadHandler(this.ctx);
      reader.readLangFiles();
      if (this.detectedLangList.length === 0) {
        return { success: true, message: t("common.noLangPathDetectedWarn"), code: EXECUTION_RESULT_CODE.NoLangPathDetected };
      }
      const resolveLang = (target: string) => {
        const targetCode = getLangCode(target);
        const defaultCode = getLangCode(this.ctx.defaultLang);
        return (
          this.detectedLangList.find(lang => lang === target) ??
          this.detectedLangList.find(lang => getLangCode(lang) === targetCode) ??
          this.detectedLangList.find(lang => getLangCode(lang) === defaultCode) ??
          this.detectedLangList.find(lang => getLangCode(lang) === "en") ??
          this.detectedLangList[0]
        );
      };
      this.ctx.referredLang = resolveLang(this.ctx.referredLang);
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
      excludedLangList: this.ctx.excludedLangList,
      includedLangList: this.ctx.includedLangList,
      globalFlag: this.ctx.globalFlag,
      rewriteFlag: this.ctx.rewriteFlag,
      exportDir: this.ctx.exportDir,
      cachePath: this.ctx.cachePath,
      ignoreEmptyLangFile: this.ctx.ignoreEmptyLangFile,
      langFileMinLength: this.ctx.langFileMinLength,
      sortingWriteMode: this.ctx.sortingWriteMode,
      sortingExportMode: this.ctx.sortingExportMode,
      defaultNamespace: this.ctx.defaultNamespace,
      tFuncNames: this.ctx.tFuncNames,
      interpolationBrackets: this.ctx.interpolationBrackets,
      namespaceSeparator: this.ctx.namespaceSeparator,
      showPreInfo: this.ctx.showPreInfo,
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
      keyPrefix: this.ctx.keyPrefix
    };
  }

  public get detectedLangList(): string[] {
    return getDetectedLangList(this.ctx);
  }

  public get langDetail() {
    return {
      langList: this.detectedLangList,
      formatType: this.ctx.langFormatType,
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

  public get i18nFeatures() {
    return {
      framework: this.ctx.i18nFramework,
      defaultNamespace: this.ctx.defaultNamespace,
      tFuncNames: this.ctx.tFuncNames,
      interpolationBrackets: this.ctx.interpolationBrackets,
      namespaceSeparator: this.ctx.namespaceSeparator
    };
  }

  private reset(): void {
    this.ctx.langFormatType = "";
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
  }
}

export default LangMage;
