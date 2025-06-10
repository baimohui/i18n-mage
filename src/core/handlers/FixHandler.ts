import { LangContextInternal, LackInfo } from "@/types";
import { CheckHandler } from "./CheckHandler";
import { RewriteHandler } from "./RewriteHandler";
import { LANG_FORMAT_TYPE, LANG_ENTRY_SPLIT_SYMBOL, getLangCode } from "@/utils/langKey";
import { TEntry } from "@/types";
import { validateLang, getIdByStr, getValueByAmbiguousEntryName } from "@/utils/regex";
import { getDetectedLangList, setUpdatedEntryValueInfo } from "@/core/tools/contextTools";
import translateTo from "@/translator/index";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { ExecutionContext } from "@/utils/context";

export class FixHandler {
  private lackInfoFromUndefined: LackInfo;
  constructor(private ctx: LangContextInternal) {
    this.lackInfoFromUndefined = {};
  }

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public async run() {
    const checker = new CheckHandler(this.ctx);
    checker.run();
    if (this.ctx.undefinedEntryList.length > 0) {
      await this.processUndefinedEntries();
    }
    await this.fillMissingTranslations();
    if (ExecutionContext.token.isCancellationRequested) {
      return;
    }
    if (this.ctx.rewriteFlag) {
      const writer = new RewriteHandler(this.ctx);
      await writer.run();
    }
  }

  private async processUndefinedEntries(): Promise<void> {
    this.lackInfoFromUndefined = {};
    const referredLangCode = getLangCode(this.ctx.referredLang);
    const referredLangMap = this.ctx.langCountryMap[this.ctx.referredLang];
    const valueKeyMap = Object.keys(referredLangMap).reduce(
      (prev, cur) => ({ ...prev, [getIdByStr(referredLangMap[cur])]: cur }),
      {} as Record<string, string>
    );
    const needTranslateList: TEntry[] = [];
    const patchedEntryIdList: TEntry[] = [];
    this.ctx.undefinedEntryList.forEach(entry => {
      if (valueKeyMap[entry.id]) {
        const isFixed = needTranslateList.every(item => item.id !== entry.id);
        if (isFixed) {
          entry.name = valueKeyMap[entry.id];
          entry.fixedRaw = this.getFixedRaw(entry, entry.name);
        }
        patchedEntryIdList.push(entry);
      } else if (validateLang(entry.text, getLangCode(this.ctx.referredLang) ?? this.ctx.referredLang)) {
        valueKeyMap[entry.id] = entry.text;
        needTranslateList.push(entry);
      }
    });
    let enNameList: string[] = needTranslateList.map(entry => entry.text);
    const enLang = this.detectedLangList.find(item => getLangCode(item) === "en")!;
    if (enNameList.length > 0) {
      if (referredLangCode !== "en" && this.ctx.credentials !== null) {
        const res = await translateTo({
          source: this.ctx.referredLang,
          target: "en",
          sourceTextList: enNameList,
          credentials: this.ctx.credentials
        });
        if (res.success && res.data) {
          this.notifyAddedText(this.ctx.referredLang, enNameList);
          this.notifyAddedText(enLang, res.data, res.api);
          enNameList = res.data;
        } else {
          return;
        }
      } else {
        this.notifyAddedText(this.ctx.referredLang, enNameList);
      }
    }
    const pcList = this.getPopularClassList();
    const namePrefix = pcList[0]?.name ?? "";
    const checkExisted = (id: string) => Boolean(getValueByAmbiguousEntryName(this.ctx.entryTree, id));
    needTranslateList.forEach((entry, index) => {
      let id = getIdByStr(enNameList[index], true);
      if (!entry.name || checkExisted(entry.name)) {
        if (entry.class && !entry.class.endsWith(LANG_ENTRY_SPLIT_SYMBOL[this.ctx.langFormatType] as string)) {
          entry.class += LANG_ENTRY_SPLIT_SYMBOL[this.ctx.langFormatType];
        }
        const baseName = entry.class || namePrefix;
        const needsNewId = id.length > 40 || checkExisted(baseName + id);
        if (needsNewId) {
          const mainName = id.length > 40 ? entry.path!.match(/([a-zA-Z0-9]+)\./)?.[1] + "Text" : id;
          id = this.generateUniqueId(mainName, baseName);
        }
        entry.name = baseName + id;
      }
      entry.fixedRaw = this.getFixedRaw(entry, entry.name);
      patchedEntryIdList.push(entry);
      referredLangMap[entry.name] = entry.text;
      this.detectedLangList.forEach(lang => {
        if ([this.ctx.referredLang, enLang].includes(lang)) {
          setUpdatedEntryValueInfo(this.ctx, entry.name, lang === this.ctx.referredLang ? entry.text : enNameList[index], lang);
        } else {
          this.lackInfoFromUndefined[lang] ??= [];
          this.lackInfoFromUndefined[lang].push(entry.name);
        }
      });
    });
    this.ctx.patchedEntryIdInfo = {};
    patchedEntryIdList.forEach(entry => {
      if (entry.fixedRaw === null || entry.fixedRaw === undefined) {
        const fixedEntryId = patchedEntryIdList.find(item => item.id === entry.id && Boolean(item.fixedRaw))?.name ?? entry.text;
        entry.name = fixedEntryId;
        entry.fixedRaw = this.getFixedRaw(entry, fixedEntryId);
      }
      this.ctx.patchedEntryIdInfo[entry.path as string] ??= [];
      this.ctx.patchedEntryIdInfo[entry.path as string].push(entry);
    });
  }

  private async fillMissingTranslations(): Promise<boolean> {
    let needTranslate = false;
    const combinedLackInfo = { ...this.ctx.lackInfo, ...this.lackInfoFromUndefined };
    for (const lang in combinedLackInfo) {
      if (ExecutionContext.token.isCancellationRequested) {
        return false;
      }
      const referredLangMap = this.ctx.langCountryMap[this.ctx.referredLang];
      const lackEntries = combinedLackInfo[lang].filter(key => referredLangMap[key]);
      if (lackEntries.length > 0 && this.ctx.credentials !== null) {
        needTranslate = true;
        const referredEntriesText = lackEntries.map(key => referredLangMap[key]);
        const res = await translateTo({
          source: this.ctx.referredLang,
          target: lang,
          sourceTextList: referredEntriesText,
          credentials: this.ctx.credentials
        });
        if (res.success && res.data) {
          this.notifyAddedText(lang, res.data, res.api);
          lackEntries.forEach((entryName, index) => {
            setUpdatedEntryValueInfo(this.ctx, entryName, res.data?.[index], lang);
          });
        }
      }
    }
    return needTranslate;
  }

  private getFixedRaw(entry: TEntry, name: string): string {
    if (this.ctx.langFormatType === LANG_FORMAT_TYPE.nonObj) {
      return name;
    } else {
      const tempVar = entry.var || {};
      const varList = Object.entries(tempVar).map(item => `${item[0]}: ${item[1]}`);
      const varStr = varList.length > 0 ? `, { ${varList.join(", ")} }` : "";
      const quote = entry.raw.match(/["'`]{1}/)![0];
      return `${entry.raw[0]}t(${quote}${name}${quote}${varStr})`;
    }
  }

  private notifyAddedText(lang: string, textList: string[], api?: string): void {
    if (api !== undefined && api !== null) {
      NotificationManager.showProgress(
        t("command.fix.progressDetail", lang, api, textList.map(item => item.replace(/\n/g, "\\n")).join(", "))
      );
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

  private generateUniqueId(main, prefix) {
    let index = 1;
    const separator = "_";
    const check = (id: string) => Boolean(getValueByAmbiguousEntryName(this.ctx.entryTree, prefix + id));
    while (check(`${main}${separator}${String(index).padStart(2, "0")}`)) {
      index++;
    }
    return `${main}${separator}${String(index).padStart(2, "0")}`;
  }
}
