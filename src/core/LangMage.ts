import type { LangContextInternal, LangContextPublic } from "@/types";
import { createLangContext } from "@/core/context";
import { CheckHandler } from "./handlers/CheckHandler";
import { FixHandler } from "./handlers/FixHandler";
import { RewriteHandler } from "./handlers/RewriteHandler";
import { ImportHandler } from "./handlers/ImportHandler";
import { ExportHandler } from "./handlers/ExportHandler";
import { TrimHandler } from "./handlers/TrimHandler";
import { ModifyHandler } from "./handlers/ModifyHandler";
import { ReadHandler } from "./handlers/ReadHandler";
import { LangMageOptions } from "@/types";
import { getDetectedLangList } from "@/core/tools/contextTools";
import { getLangCode, I18N_SOLUTION } from "@/utils/langKey";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
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
        referredLang: getConfig<string>("referenceLanguage", "en"),
        i18nSolution: getConfig<(typeof I18N_SOLUTION)[keyof typeof I18N_SOLUTION]>("i18nSolution"),
        ignoredFileList: getConfig<string[]>("ignoredFileList", []),
        langFileMinLength: getConfig<number>("langFileMinLength", 0),
        ignoreEmptyLangFile: getConfig<boolean>("ignoreEmptyLangFile", true),
        sortWithTrim: getConfig<boolean>("sortWithTrim", true),
        manuallyMarkedUsedEntries: getConfig<string[]>("manuallyMarkedUsedEntries", []),
        credentials: {
          baiduAppId: getConfig<string>("baiduAppId", ""),
          baiduSecretKey: getConfig<string>("baiduSecretKey", ""),
          tencentSecretId: getConfig<string>("tencentSecretId", ""),
          tencentSecretKey: getConfig<string>("tencentSecretKey", ""),
          translateApiPriority: getConfig<string[]>("translateApiPriority", ["google", "baidu", "tencent"])
        },
        syncBasedOnReferredEntries: getConfig<boolean>("syncBasedOnReferredEntries", true),
        ...options
      };
      for (const [key, value] of Object.entries(combinedOptions)) {
        if (key === "checkAimList") {
          this.ctx.checkUnityFlag = (value as string[]).includes("unity");
          this.ctx.checkRepeatFlag = (value as string[]).includes("repeat");
          this.ctx.checkStyleFlag = (value as string[]).includes("style");
        } else if (Object.hasOwn(this.ctx, key)) {
          this.ctx[key] = value as string;
        }
      }
    }
  }

  public async execute(): Promise<boolean> {
    if (!this.ctx.isVacant) {
      NotificationManager.showWarning(t("common.progress.processing"));
      return false;
    }
    try {
      this.ctx.isVacant = false;
      console.time("本次耗时");
      if (this.ctx.clearCache) this.reset();
      const reader = new ReadHandler(this.ctx);
      reader.readLangFiles();
      if (this.detectedLangList.length === 0) {
        return false;
      }
      this.ctx.referredLang =
        this.detectedLangList.find(item => item === this.ctx.referredLang) ??
        this.detectedLangList.find(lang => getLangCode(lang) === "en") ??
        this.detectedLangList.find(lang => getLangCode(lang) === "zh") ??
        this.detectedLangList[0];

      if (this.ctx.globalFlag) {
        reader.startCensus();
      }
      switch (this.ctx.task) {
        case "check":
          new CheckHandler(this.ctx).run();
          break;
        case "fix":
          await new FixHandler(this.ctx).run();
          break;
        case "export":
          new ExportHandler(this.ctx).run();
          break;
        case "import":
          await new ImportHandler(this.ctx).run();
          break;
        case "modify":
          await new ModifyHandler(this.ctx).run();
          break;
        case "trim":
          await new TrimHandler(this.ctx).run();
          break;
        case "rewrite":
          await new RewriteHandler(this.ctx).run();
          break;
      }
      return true;
    } catch (e: unknown) {
      if (e instanceof Error) {
        NotificationManager.showError(t("common.progress.error", e.message));
      } else {
        NotificationManager.showError(t("common.progress.error", e as string));
      }
      console.error(e);
      return false;
    } finally {
      this.ctx.isVacant = true;
      console.timeEnd("本次耗时");
    }
  }

  public getPublicContext(): LangContextPublic {
    return {
      task: this.ctx.task,
      langPath: this.ctx.langPath,
      langFileType: this.ctx.langFileType,
      projectPath: this.ctx.projectPath,
      referredLang: this.ctx.referredLang,
      checkUnityFlag: this.ctx.checkUnityFlag,
      checkRepeatFlag: this.ctx.checkRepeatFlag,
      checkStyleFlag: this.ctx.checkStyleFlag,
      excludedLangList: this.ctx.excludedLangList,
      includedLangList: this.ctx.includedLangList,
      globalFlag: this.ctx.globalFlag,
      rewriteFlag: this.ctx.rewriteFlag,
      exportDir: this.ctx.exportDir,
      cachePath: this.ctx.cachePath,
      ignoreEmptyLangFile: this.ctx.ignoreEmptyLangFile,
      langFileMinLength: this.ctx.langFileMinLength,
      sortWithTrim: this.ctx.sortWithTrim,
      showPreInfo: this.ctx.showPreInfo,
      styleScore: this.ctx.styleScore,
      fileStructure: this.ctx.fileStructure,
      syncBasedOnReferredEntries: this.ctx.syncBasedOnReferredEntries,
      manuallyMarkedUsedEntries: this.ctx.manuallyMarkedUsedEntries,
      modifyList: this.ctx.modifyList,
      i18nSolution: this.ctx.i18nSolution
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
      tree: this.ctx.entryTree,
      updatedValues: this.ctx.updatedEntryValueInfo,
      patchedIds: this.ctx.patchedEntryIdInfo
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
    this.ctx.primaryPathLevel = 0;
    this.ctx.roguePath = "";
    this.ctx.isVacant = true;
    this.ctx.entryTree = {};
    this.ctx.updatedEntryValueInfo = {};
    this.ctx.patchedEntryIdInfo = {};
  }
}

export default LangMage;
