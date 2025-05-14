import fs from "fs";
import path from "path";
import xlsx from "node-xlsx";
import translateTo from "./translator/index";
import { printInfo, printTitle } from "./utils/print";
import { LANG_FORMAT_TYPE, LANG_ENTRY_SPLIT_SYMBOL, getLangText, getLangCode, getLangIntro } from "./utils/const";
import {
  getCaseType,
  getLangFileInfo,
  getIdByStr,
  validateLang,
  escapeEntryName,
  unescapeEntryName,
  setValueByEscapedEntryName,
  getValueByAmbiguousEntryName,
  formatObjectToString,
  catchAllEntries
} from "./utils/regex";
import { EntryTree, LangDictionary, LangCountryMap, LangTree, EntryClassInfo, ExcelData, TEntry, LackInfo, NullInfo } from "./types";
import { PrintType } from "./utils/print";

interface LangCheckRobotOptions {
  task?: string;
  langDir?: string;
  rootPath?: string;
  checkUnityFlag?: boolean;
  checkRepeatFlag?: boolean;
  checkStyleFlag?: boolean;
  excludedLangList?: string[];
  includedLangList?: string[];
  ignoredFileList?: string[];
  referredLang?: string;
  globalFlag?: boolean;
  rewriteFlag?: boolean;
  exportDir?: string;
  cachePath?: string;
  ignoreEmptyLangFile?: boolean;
  langFileMinLength?: number;
  sortWithTrim?: boolean;
  showPreInfo?: boolean;
  importExcelFrom?: string;
  exportExcelTo?: string;
  clearCache?: boolean;
  credentials?: Record<string, any>;
  syncBasedOnReferredEntries?: boolean;
  modifyList?: Array<{ name: string; value: string; lang: string }>;
  trimNameList?: string[];
}

class LangCheckRobot {
  private static instance: LangCheckRobot;
  private langFileType: string = "";
  private langFormatType: string = "";
  private langDictionary: LangDictionary = {};
  private langCountryMap: LangCountryMap = {};
  private lackInfo: LackInfo = {};
  private extraInfo: Record<string, string[]> = {};
  private nullInfo: NullInfo = {};
  private referredEntryList: string[] = [];
  private singleLangRepeatTextInfo: Record<string, Record<string, string[]>> = {};
  private multiLangRepeatTextInfo: Record<string, string[]> = {};
  private entryClassTree: Record<string, any> = {};
  private entryClassInfo: EntryClassInfo = {};
  private styleScore: number = 0;
  private undefinedEntryList: TEntry[] = [];
  private undefinedEntryMap: Record<string, Record<string, number[]>> = {};
  private usedEntryMap: Record<string, Record<string, number[]>> = {};
  private langIndents: Record<string, string> = {};
  private langFileExtraInfo: Record<string, object> = {};
  private primaryPathLevel: number = 0;
  private roguePath: string = "";
  private isVacant: boolean = true;
  private langTree: LangTree = {};
  private updatedEntryValueInfo: Record<string, Record<string, string | undefined>> = {};
  private patchedEntryIdInfo: Record<string, TEntry[]> = {};

  public task: string = "";
  public langDir: string = "";
  public rootPath: string = "";
  public checkUnityFlag: boolean = true;
  public checkRepeatFlag: boolean = false;
  public checkStyleFlag: boolean = false;
  public excludedLangList: string[] = [];
  public includedLangList: string[] = [];
  public ignoredFileList: string[] = [];
  public referredLang: string = "";
  public globalFlag: boolean = false;
  public rewriteFlag: boolean = false;
  public exportDir: string = "";
  public cachePath: string = "";
  public ignoreEmptyLangFile: boolean = true;
  public langFileMinLength: number = 0;
  public sortWithTrim: boolean = false;
  public showPreInfo: boolean = true;
  public importExcelFrom: string = "";
  public importSheetData: string = "";
  public exportExcelTo: string = "";
  public clearCache: boolean = true;
  public credentials: Record<string, any> = {};
  public syncBasedOnReferredEntries: boolean = false;
  public modifyList: Array<{ name: string; value: string; lang: string }> = [];
  public trimNameList: string[] = [];

  private constructor(options?: LangCheckRobotOptions) {
    this._reset();
    this.setOptions(options);
  }

  public static getInstance(): LangCheckRobot {
    if (LangCheckRobot.instance == null) {
      LangCheckRobot.instance = new LangCheckRobot();
    }
    return LangCheckRobot.instance;
  }

  public setOptions(options: LangCheckRobotOptions = {}): void {
    if (Object.prototype.toString.call(options) === "[object Object]") {
      for (const [key, value] of Object.entries(options)) {
        if (["excludedLangList", "includedLangList"].includes(key)) {
          this[key] = (value as string[]).map(lang => lang.split(".")[0]);
        } else if (key === "checkAimList") {
          this.checkUnityFlag = (value as string[]).includes("unity");
          this.checkRepeatFlag = (value as string[]).includes("repeat");
          this.checkStyleFlag = (value as string[]).includes("style");
        } else if (key in this) {
          (this as Record<string, unknown>)[key] = value;
        }
      }
    }
  }

  public async execute(): Promise<boolean> {
    if (!this.isVacant) {
      printInfo("检测器正忙，请稍后再试！", "brain");
      return false;
    }
    try {
      this.isVacant = false;
      console.time("本次耗时");
      if (this.clearCache) this._reset();
      this._readLangFiles();
      if (this.detectedLangList.length === 0) {
        printInfo("请确认检测路径是否为多语言文件所在的目录！", "brain");
        return false;
      }
      if (this.globalFlag) {
        this._startCensus();
      }
      switch (this.task) {
        case "check":
          if (this.checkUnityFlag) this._checkUnity();
          if (this.checkRepeatFlag) this._checkRepeat();
          if (this.checkStyleFlag) this._checkStyle();
          if (this.globalFlag) this._checkUsage();
          this._genOverviewTable();
          break;
        case "fix":
          this._checkUnity();
          await this._handleFix();
          break;
        case "export":
          this._handleExport();
          break;
        case "import":
          this._handleImport();
          break;
        case "modify":
          this._handleModify();
          break;
        case "trim":
          this._handleTrim();
          break;
        case "rewrite":
          this._handleRewrite();
          break;
        default:
          this._genOverviewTable();
      }
      return true;
    } catch (e: unknown) {
      if (e instanceof Error) {
        printInfo(`检测中断，出现异常报错：${e.message}`, "demon");
      } else {
        printInfo(`检测中断，出现非 Error 类型的报错：${e as string}`, "demon");
      }
      console.error(e);
      return false;
    } finally {
      this.isVacant = true;
      console.timeEnd("本次耗时");
    }
  }

  public get isProcessing(): boolean {
    return !this.isVacant;
  }

  public get detectedLangList(): string[] {
    const langKeys = Object.keys(this.langCountryMap) ?? [];
    langKeys.sort((a, b) => this.includedLangList.indexOf(a) - this.includedLangList.indexOf(b));
    return langKeys;
  }

  public get langDetail() {
    return {
      langList: this.detectedLangList,
      fileType: this.langFileType,
      formatType: this.langFormatType,
      dictionary: this.langDictionary,
      lack: this.lackInfo,
      extra: this.extraInfo,
      null: this.nullInfo,
      refer: this.referredEntryList,
      countryMap: this.langCountryMap,
      used: this.usedEntryMap,
      undefined: this.undefinedEntryMap,
      tree: this.langTree,
      updatedValues: this.updatedEntryValueInfo,
      patchedIds: this.patchedEntryIdInfo
    };
  }

  private _reset(): void {
    this.langFormatType = "";
    this.langFileType = "";
    this.langDictionary = {};
    this.langCountryMap = {};
    this.lackInfo = {};
    this.extraInfo = {};
    this.nullInfo = {};
    this.referredEntryList = [];
    this.singleLangRepeatTextInfo = {};
    this.multiLangRepeatTextInfo = {};
    this.entryClassTree = {};
    this.entryClassInfo = {};
    this.styleScore = 0;
    this.undefinedEntryList = [];
    this.undefinedEntryMap = {};
    this.usedEntryMap = {};
    this.langIndents = {};
    this.langFileExtraInfo = {};
    this.primaryPathLevel = 0;
    this.roguePath = "";
    this.isVacant = true;
    this.langTree = {};
    this.updatedEntryValueInfo = {};
    this.patchedEntryIdInfo = {};
  }

  private _readLangFiles(): void {
    this.langFormatType = "";
    const files = fs.readdirSync(this.langDir);
    const langTree: LangTree = {};
    files.forEach(file => {
      if (![".js", ".json", ".ts"].includes(path.extname(file))) {
        if (this.showPreInfo) {
          printInfo(`文件 ${file} 类型不符合规范，跳过检测！`, "ghost");
        }
        return;
      }
      if (this.excludedLangList.some(lang => file.split(".")[0] !== lang)) {
        if (this.showPreInfo) {
          printInfo(`文件 ${file} 所属语言被排除，跳过检测！`, "ghost");
        }
        return;
      }
      if (this.includedLangList.length > 0 && this.includedLangList.every(lang => file.split(".")[0] !== lang)) {
        if (this.showPreInfo) {
          printInfo(`文件 ${file} 所属语言被排除，跳过检测！`, "ghost");
        }
        return;
      }
      const fileContents = fs.readFileSync(path.join(this.langDir, file), "utf8");
      if (this.ignoreEmptyLangFile && fileContents.length < this.langFileMinLength) {
        if (this.showPreInfo) {
          printInfo(`文件 ${file} 疑似为空白文件，跳过检测！`, "ghost");
        }
        return;
      }
      const fileInfo = getLangFileInfo(fileContents);
      if (!fileInfo || file.startsWith("index") || (this.langFormatType && this.langFormatType !== fileInfo.formatType)) {
        if (this.showPreInfo) {
          printInfo(`文件 ${file} 格式不符合规范，跳过检测！`, "ghost");
        }
        return;
      }
      const { formatType, content: entryMap, indents, prefix, suffix, innerVar, keyQuotes, raw } = fileInfo;
      const [fileName, fileType] = file.split(".");
      this.langFileType = fileType;
      this.langFormatType = formatType;
      this.langIndents[fileName] = indents;
      this.langCountryMap[fileName] = entryMap;
      this.langFileExtraInfo[fileName] = { prefix, suffix, innerVar, keyQuotes };
      langTree[fileName] = raw;
    });
    function mergeTreesToTwoObjectsSemantic(trees: EntryTree[], labels: string[]): { structure: LangTree; lookup: LangDictionary } {
      const structure: LangTree = {};
      const lookup: LangDictionary = {};
      function setAtPath(obj: EntryTree, path: string[], value: string): void {
        let cur = obj;
        for (let i = 0; i < path.length - 1; i++) {
          const key = path[i];
          if (!Object.hasOwn(cur, key) || typeof cur[key] !== "object") {
            cur[key] = {};
          }
          cur = cur[key];
        }
        cur[path[path.length - 1]] = value;
      }
      function traverse(node: string | EntryTree, path: string[], label: string): void {
        if (typeof node === "string") {
          const id = path.map(key => escapeEntryName(key)).join(".");
          setAtPath(structure, path, id);
          if (!(id in lookup)) {
            lookup[id] = {};
          }
          lookup[id][label] = node;
        } else {
          for (const key in node) {
            traverse(node[key], path.concat(key), label);
          }
        }
      }
      trees.forEach((tree, i) => traverse(tree, [], labels[i]));
      return { structure, lookup };
    }
    if (this.detectedLangList.length > 0) {
      this.referredLang = this.detectedLangList.find(item => item.includes(this.referredLang))!;
      const { structure, lookup } = mergeTreesToTwoObjectsSemantic(Object.values(langTree), Object.keys(langTree));
      this.langTree = structure;
      this.langDictionary = lookup;
      if (!this.referredLang) {
        // TODO 中英文判断逻辑待优化
        const cnName = this.detectedLangList.find(a => ["cn", "zh"].some(b => a.startsWith(b)));
        const enName = this.detectedLangList.find(a => a.startsWith("en"));
        this.referredLang = cnName ?? enName ?? this.detectedLangList[0];
      }
      this.referredEntryList = [...new Set(this.referredEntryList.concat(Object.keys(this.langCountryMap[this.referredLang])))];
      Object.keys(this.langDictionary).forEach(entry => this._genEntryClassTree(unescapeEntryName(entry)));
    }
  }

  private _checkUnity(): void {
    const needFixFlag = this.task === "fix";
    if (!needFixFlag) {
      printTitle("检测各语种与参考语种的条目一致性");
    }
    this.detectedLangList.forEach(lang => {
      const translation = this.langCountryMap[lang];
      const missingTranslations: string[] = [];
      const nullTranslations: string[] = [];
      const pivotEntryList = this.syncBasedOnReferredEntries ? this.referredEntryList : Object.keys(this.langDictionary);
      pivotEntryList.forEach(entry => {
        if (!Object.hasOwn(translation, entry)) {
          missingTranslations.push(entry);
        } else if (translation[entry] === null || translation[entry] === undefined) {
          nullTranslations.push(entry);
        }
      });
      const langName = this._getLangFileName(lang);
      if (missingTranslations.length > 0 && !needFixFlag) {
        printInfo(`文件 ${langName} 缺少条目：${this._formatEntriesInTerminal(missingTranslations)}`, "error");
      }
      this.lackInfo[lang] = missingTranslations;
      this.nullInfo[lang] = nullTranslations;

      const extraTranslations: string[] = [];
      if (this.syncBasedOnReferredEntries) {
        for (const entry in translation) {
          if (!this.referredEntryList.includes(entry)) {
            extraTranslations.push(entry);
          }
        }
      }
      if (extraTranslations.length > 0 && !needFixFlag) {
        printInfo(`文件 ${langName} 多出条目：${this._formatEntriesInTerminal(extraTranslations)}`, "puzzle");
      }
      this.extraInfo[lang] = extraTranslations;

      if (missingTranslations.length === 0 && extraTranslations.length === 0 && !needFixFlag) {
        printInfo(`文件 ${langName} 条目保持一致！`, "success");
      }
    });
  }

  private _checkRepeat(): void {
    printTitle("检测条目在不同语种的译文是否相同");
    let isTextRepeatedInEntriesInLangs = false;
    for (const entry in this.langDictionary) {
      const list = Object.values(this.langDictionary[entry]);
      const filterList = [...new Set(list)];
      if (list.length !== filterList.length) {
        isTextRepeatedInEntriesInLangs = true;
        this.multiLangRepeatTextInfo[entry] = [];
        if (list.length > 1 && filterList.length === 1) {
          this.multiLangRepeatTextInfo[entry].push(this.detectedLangList.join(","));
        } else {
          filterList.forEach(filterItem => {
            const repeatLangList = Object.keys(this.langDictionary[entry]).filter(lang => this.langDictionary[entry][lang] === filterItem);
            const isElWithPor = repeatLangList.every(lang => ["el", "por", "po"].some(langKey => lang.includes(langKey)));
            if (repeatLangList.length > 1 && !isElWithPor) {
              this.multiLangRepeatTextInfo[entry].push(repeatLangList.join(","));
              printInfo(`${entry} 在 ${repeatLangList.join("、")} 的译文相同：${filterItem}`, "puzzle");
            }
          });
        }
      }
    }
    if (!isTextRepeatedInEntriesInLangs) {
      printInfo("未检测到重复的译文！", "success");
    }
  }

  private _checkStyle(): void {
    const classTotalNum = Object.keys(this.entryClassInfo).length;
    const layerInfo: Record<string, number> = {};
    for (const entryClass in this.entryClassInfo) {
      this.entryClassInfo[entryClass].layer.forEach(item => {
        const layer = item - 1;
        layerInfo[layer] ??= 0;
        layerInfo[layer]++;
      });
    }
    printTitle("检测条目分类层级风格");
    const layerTable: Record<string, Record<string, any>> = {};
    const layerNumInfo: Record<string, any> = {};
    const layerRatioInfo: Record<string, any> = {};
    const layerKeys = Object.keys(layerInfo).sort();
    layerKeys.forEach(key => {
      const layerName = `${key == "0" ? "未" : key + " 级"}分类`;
      layerNumInfo[layerName] = layerInfo[key];
      layerRatioInfo[layerName] = ((layerInfo[key] / classTotalNum) * 100).toFixed(2) + "%";
    });
    layerTable["数量"] = layerNumInfo;
    layerTable["占比"] = layerRatioInfo;
    delete layerInfo["0"];
    const layerScore =
      Object.values(layerInfo)
        .sort((a, b) => (a >= b ? -1 : 1))
        .slice(0, 2)
        .reduce((prev, cur) => prev + cur, 0) / classTotalNum;
    printInfo("建议在条目命名上按功能或模块进行清晰简要的分类", this._getScore(layerScore));
    console.table(layerTable);
    this.styleScore = layerScore;
  }

  private _handleExport(): void {
    printTitle("导出翻译");
    if (!this.exportExcelTo) {
      printInfo("导出文件路径不存在！", "brain");
      return;
    }

    const tableData = [["Label", ...this.detectedLangList.map(item => getLangText(item, "en"))]];
    for (const entry in this.langDictionary) {
      const itemList = [entry];
      const entryMap = this.langDictionary[entry];
      this.detectedLangList.forEach(lang => {
        itemList.push(entryMap[lang]);
      });
      tableData.push(itemList);
    }
    const sheetOptions = {
      "!cols": [
        { wch: 24 },
        ...Array.from({ length: this.detectedLangList.length }, () => ({
          wch: 48
        }))
      ]
    };
    const buffer = xlsx.build([{ name: "Sheet1", data: tableData, options: {} }], { sheetOptions });
    fs.writeFileSync(this.exportExcelTo, buffer);
    fs.writeFileSync(this.exportExcelTo.replace(".xlsx", "New.xlsx"), buffer);
    printInfo(`翻译表格已导出到 ${this.exportExcelTo} 路径`, "rocket");
  }

  private _handleImport(): void {
    printTitle("导入翻译");
    if (!fs.existsSync(this.importExcelFrom)) {
      printInfo("导入文件路径不存在！", "brain");
      return;
    }
    const excelData = xlsx.parse(this.importExcelFrom) as ExcelData;
    let isModified = false;
    for (let sheetIndex = 0; sheetIndex < excelData.length; sheetIndex++) {
      const sheetData = excelData[sheetIndex].data;
      if (sheetData.length === 0) continue;
      const [headInfo] = sheetData.splice(0, 1);
      const headLen = headInfo.length;
      for (let i = 0; i <= headLen; i++) {
        if (typeof headInfo[i] === "string") {
          headInfo[i] = String(headInfo[i]).trim();
        } else {
          headInfo[i] = "NULL";
        }
      }
      printInfo(
        `检测到表格内有效的语言列为：${
          headInfo
            .map(item => getLangIntro(item as string)?.cnName)
            .filter(item => item !== null && item !== undefined)
            .join("、") || "无"
        }`,
        "brain"
      );
      const labelIndex = headInfo.findIndex(item => String(item).toLowerCase() === "label");
      sheetData.forEach(item => {
        let entryName = item[labelIndex] ?? "";
        entryName = entryName.toString().trim();
        if (entryName in this.langDictionary) {
          this.detectedLangList.forEach(lang => {
            const langIntro = getLangIntro(lang) || {};
            const langAlias = Object.values(langIntro);
            if (!langAlias.includes(lang)) {
              langAlias.push(lang);
            }
            const oldLangText = this.langDictionary[entryName][lang];
            const newLangText =
              item[
                headInfo.findIndex(item => langAlias.some(alias => String(alias).toLowerCase() === String(item).toLowerCase()))
              ]?.toString() ?? "";
            if (newLangText.trim() && oldLangText !== newLangText) {
              printInfo(
                `条目 ${entryName} ${getLangText(lang)}更改：\x1b[31m${oldLangText}\x1b[0m -> \x1b[32m${newLangText}\x1b[0m`,
                "mage"
              );
              this._setUpdatedEntryValueInfo(entryName, newLangText, lang);
              isModified = true;
            }
          });
        }
      });
    }
    if (this.rewriteFlag) {
      this._handleRewrite();
    }
    if (!isModified) {
      printInfo("未检测到文案变动的条目", "success");
    }
  }

  private _handleModify(): void {
    printTitle("修改翻译条目");
    this.modifyList.forEach(item => {
      const { name, value, lang } = item;
      const entryName = getValueByAmbiguousEntryName(this.langTree, name);
      if (typeof entryName === "string" && entryName.trim() !== "") {
        this._setUpdatedEntryValueInfo(entryName, value, lang);
      }
    });
    if (this.rewriteFlag) {
      this._handleRewrite();
    }
  }

  private _handleTrim(): void {
    printTitle("清理翻译条目");
    if (this.trimNameList.length > 0) {
      this.trimNameList.forEach(name => {
        this._setUpdatedEntryValueInfo(name, undefined);
      });
      if (this.rewriteFlag) {
        this._handleRewrite();
      }
    } else {
      printInfo("未检测到需要清理的翻译条目！", "success");
    }
  }

  private async _handleFix(): Promise<void> {
    printTitle(`补充翻译${this.globalFlag ? "与修正条目" : ""}`);
    if (this.undefinedEntryList.length > 0) {
      await this._processUndefinedEntries();
    }
    const needTranslate = await this._fillMissingTranslations();
    if (!needTranslate) {
      printInfo("翻译齐全，无需补充！", "success");
    }
    if (this.rewriteFlag) {
      this._handleRewrite();
    }
  }

  private _handleRewrite(): void {
    printTitle("写入翻译条目");
    for (const [lang, entryInfo] of Object.entries(this.updatedEntryValueInfo)) {
      for (const [entry, value] of Object.entries(entryInfo)) {
        this._updateEntryValue(entry, value, lang);
      }
      this._rewriteTranslationFile(lang);
    }
    this.updatedEntryValueInfo = {};
    this._applyGlobalFixes();
  }

  private async _processUndefinedEntries(): Promise<void> {
    const referredLangCode = getLangCode(this.referredLang);
    const referredLangMap = this.langCountryMap[this.referredLang];
    const valueKeyMap = Object.keys(referredLangMap).reduce(
      (prev, cur) => ({ ...prev, [getIdByStr(referredLangMap[cur])]: cur }),
      {} as Record<string, string>
    );
    const needTranslateList: TEntry[] = [];
    const patchedEntryIdList: TEntry[] = [];
    this.undefinedEntryList.forEach(entry => {
      if (valueKeyMap[entry.id]) {
        const isFixed = needTranslateList.every(item => item.id !== entry.id);
        if (isFixed) {
          entry.name = valueKeyMap[entry.id];
          entry.fixedRaw = this._getFixedRaw(entry, entry.name);
        }
        patchedEntryIdList.push(entry);
      } else if (validateLang(entry.text, getLangCode(this.referredLang))) {
        valueKeyMap[entry.id] = entry.text;
        needTranslateList.push(entry);
      }
    });
    let enNameList = needTranslateList.map(entry => entry.text);
    const enLang = this.detectedLangList.find(item => getLangCode(item) === "en")!;
    if (enNameList.length > 0) {
      if (referredLangCode !== "en") {
        const res = await translateTo({
          source: this.referredLang,
          target: "en",
          sourceTextList: enNameList,
          credentials: this.credentials
        });
        if (res.success && res.data) {
          this._printAddedText(this.referredLang, enNameList);
          this._printAddedText(enLang, res.data, res.api);
          enNameList = res.data;
        } else {
          printInfo(res.message, "error");
          return;
        }
      } else {
        this._printAddedText(this.referredLang, enNameList);
      }
    }
    const pcList = this._getPopularClassList();
    const namePrefix = pcList[0]?.name ?? "";
    const checkExisted = (id: string) => Boolean(getValueByAmbiguousEntryName(this.langTree, id));
    needTranslateList.forEach((entry, index) => {
      let id = getIdByStr(enNameList[index], true);
      if (!entry.name || checkExisted(entry.name)) {
        if (entry.class && !entry.class.endsWith(LANG_ENTRY_SPLIT_SYMBOL[this.langFormatType] as string)) {
          entry.class += LANG_ENTRY_SPLIT_SYMBOL[this.langFormatType];
        }
        const baseName = entry.class || namePrefix;
        const needsNewId = id.length > 40 || checkExisted(baseName + id);
        if (needsNewId) {
          const mainName = id.length > 40 ? entry.path!.match(/([a-zA-Z0-9]+)\./)?.[1] + "Text" : id;
          id = this._generateUniqueId(mainName, baseName);
        }
        entry.name = baseName + id;
      }
      entry.fixedRaw = this._getFixedRaw(entry, entry.name);
      patchedEntryIdList.push(entry);
      referredLangMap[entry.name] = entry.text;
      this.detectedLangList.forEach(lang => {
        if ([this.referredLang, enLang].includes(lang)) {
          this._setUpdatedEntryValueInfo(entry.name, lang === this.referredLang ? entry.text : enNameList[index], lang);
        } else {
          this.lackInfo[lang] ??= [];
          this.lackInfo[lang].push(entry.name);
        }
      });
    });
    this.patchedEntryIdInfo = {};
    patchedEntryIdList.forEach(entry => {
      if (entry.fixedRaw === null || entry.fixedRaw === undefined) {
        const fixedEntryId = patchedEntryIdList.find(item => item.id === entry.id && Boolean(item.fixedRaw))?.name ?? entry.text;
        entry.name = fixedEntryId;
        entry.fixedRaw = this._getFixedRaw(entry, fixedEntryId);
      }
      this.patchedEntryIdInfo[entry.path as string] ??= [];
      this.patchedEntryIdInfo[entry.path as string].push(entry);
    });
  }

  private _generateUniqueId(main, prefix) {
    let index = 1;
    const separator = "_";
    const check = (id: string) => Boolean(getValueByAmbiguousEntryName(this.langTree, prefix + id));

    while (check(`${main}${separator}${String(index).padStart(2, "0")}`)) {
      index++;
    }
    return `${main}${separator}${String(index).padStart(2, "0")}`;
  }

  private async _fillMissingTranslations(): Promise<boolean> {
    let needTranslate = false;
    for (const lang in this.lackInfo) {
      const referredLangMap = this.langCountryMap[this.referredLang];
      const lackEntries = this.lackInfo[lang].filter(entry => referredLangMap[entry]);
      if (lackEntries.length > 0) {
        needTranslate = true;
        const referredEntriesText = lackEntries.map(entry => referredLangMap[entry]);
        const res = await translateTo({
          source: this.referredLang,
          target: lang,
          sourceTextList: referredEntriesText,
          credentials: this.credentials
        });
        if (res.success && res.data) {
          this._printAddedText(lang, res.data, res.api);
          lackEntries.forEach((entryName, index) => {
            this._setUpdatedEntryValueInfo(entryName, res.data?.[index], lang);
          });
        } else {
          printInfo(res.message, "error");
        }
      }
    }
    return needTranslate;
  }

  private _applyGlobalFixes(): void {
    for (const fixPath in this.patchedEntryIdInfo) {
      let fileContent = fs.readFileSync(fixPath, "utf8");
      const fixList = this.patchedEntryIdInfo[fixPath];
      fixList.forEach(item => {
        fileContent = fileContent.replaceAll(item.raw, item.fixedRaw as string);
      });
      fs.writeFileSync(fixPath, fileContent);
      const fixedEntries = this._formatEntriesInTerminal(
        fixList.map(item => `\x1b[31m${item.text}\x1b[0m -> \x1b[32m${item.name}\x1b[0m`),
        false
      );
      printInfo(`文件 ${this._getRelativePath(fixPath)} 修正条目：${fixedEntries}`, "mage");
    }
    this.patchedEntryIdInfo = {};
  }

  private _setUpdatedEntryValueInfo(name: string, value: string | undefined, lang?: string): void {
    const langList = Object.keys(this.langCountryMap).filter(item => lang == null || item === lang);
    langList.forEach(lang => {
      this.updatedEntryValueInfo[lang] ??= {};
      this.updatedEntryValueInfo[lang][name] = value;
    });
  }

  private _updateEntryValue(name: string, value: string | undefined, lang: string): void {
    if (typeof value === "string") {
      if (Object.hasOwn(this.langDictionary, name)) {
        this.langDictionary[name][lang] = value;
      } else {
        this.langDictionary[name] = { [lang]: value };
      }
      this.langCountryMap[lang][name] = value;
      setValueByEscapedEntryName(this.langTree, name, name);
    } else {
      delete this.langDictionary[name][lang];
      delete this.langCountryMap[lang][name];
      setValueByEscapedEntryName(this.langTree, name, undefined);
    }
  }

  private _rewriteTranslationFile(lang: string): void {
    const filePath = path.join(this.langDir, this._getLangFileName(lang));
    const fileContent = formatObjectToString(
      this.langCountryMap[lang],
      this.langFileType,
      this.langIndents[lang],
      this.langFileExtraInfo[lang]
    );
    fs.writeFileSync(filePath, fileContent);
    printInfo(`文件 ${this._getLangFileName(lang)} 翻译已写入`, "rocket");
  }

  private _getFixedRaw(entry: TEntry, name: string): string {
    if (this.langFormatType === LANG_FORMAT_TYPE.nonObj) {
      return name;
    } else {
      const tempVar = entry.var || {};
      const varList = Object.entries(tempVar).map(item => `${item[0]}: ${item[1]}`);
      const varStr = varList.length > 0 ? `, { ${varList.join(", ")} }` : "";
      const quote = entry.raw.match(/["'`]{1}/)![0];
      return `${entry.raw[0]}t(${quote}${name}${quote}${varStr})`;
    }
  }

  private _printAddedText(lang: string, textList: string[], api?: string): void {
    printInfo(
      `文件 ${this._getLangFileName(lang)} 补充${api !== undefined && api !== null ? ` ${api} ` : ""}翻译：${textList
        .map(item => `\x1b[36m${item.replaceAll(/\n/g, "\\n")}\x1b[0m`)
        .join(", ")}`,
      "mage"
    );
  }

  private _genEntryClassTree(entry: string = ""): void {
    const splitSymbol = LANG_ENTRY_SPLIT_SYMBOL[this.langFormatType] as string;
    const structure = entry.split(splitSymbol);
    const structureLayer = structure.length;
    const primaryClass = structure[0];
    if (Object.hasOwn(this.entryClassInfo, primaryClass)) {
      const classInfo = this.entryClassInfo[primaryClass];
      classInfo.num++;
      if (!classInfo.layer.includes(structureLayer)) {
        classInfo.layer.push(structureLayer);
      }
    } else {
      this.entryClassInfo[primaryClass] = {
        num: 1,
        layer: [structureLayer],
        case: getCaseType(primaryClass),
        childrenCase: {}
      };
    }
    let tempObj = this.entryClassTree;
    structure.forEach((key, index) => {
      if (tempObj[key] === undefined || tempObj[key] === null) {
        if (structureLayer > index + 1) {
          tempObj[key] = {};
        } else {
          tempObj[key] = null;
          const keyCase = getCaseType(key);
          const childrenCase = this.entryClassInfo[primaryClass].childrenCase;
          childrenCase[keyCase] ??= 0;
          childrenCase[keyCase]++;
        }
      }
      tempObj = tempObj[key] as object;
    });
  }

  private _getPopularClassMap(tree: Record<string, object>, map: Record<string, number> = {}, classPrefix: string = ""): Record<string, number> {
    const splitSymbol = LANG_ENTRY_SPLIT_SYMBOL[this.langFormatType] as string
    for (const [key, value] of Object.entries(tree)) {
      const itemName = classPrefix + key + splitSymbol;
      if (value !== null && value !== undefined) {
        map[itemName] = Object.keys(value).length;
        this._getPopularClassMap(value as Record<string, object>, map, itemName);
      }
    }
    return map;
  }

  private _getPopularClassList(): Array<{ name: string; value: number }> {
    const map = this._getPopularClassMap(this.entryClassTree);
    return Object.keys(map)
      .sort((a, b) => (map[a] > map[b] ? -1 : 1))
      .map(item => ({ name: item, value: map[item] }));
  }

  private _checkUsage(): void {
    printTitle("检测条目是否使用");
    const unusedEntryList = this.referredEntryList.map(name => unescapeEntryName(name)).filter(entry => !Object.hasOwn(this.usedEntryMap, entry));
    if (unusedEntryList.length > 0) {
      printInfo(`存在疑似未使用条目：${this._formatEntriesInTerminal(unusedEntryList)}`, "puzzle");
    }
    if (this.undefinedEntryList.length > 0) {
      const undefinedEntryList = [...new Set(this.undefinedEntryList.map(item => item.text))];
      printInfo(`存在疑似未定义条目：${this._formatEntriesInTerminal(undefinedEntryList)}`, "puzzle");
    }
    if (unusedEntryList.length === 0 && this.undefinedEntryList.length === 0) {
      printInfo("不存在疑似未定义或未使用的条目！", "success");
    }
  }

  private _startCensus(): void {
    if (this.showPreInfo) {
      printInfo("正在对条目进行全局捕获，这可能需要一点时间...", "brain");
    }
    const filePaths = this._readAllFiles(this.rootPath);
    const pathLevelCountMap: Record<number, number> = {};
    let maxNum = 0;
    const totalEntryList = Object.keys(this.langDictionary).map(key => unescapeEntryName(key));
    this.undefinedEntryList = [];
    this.undefinedEntryMap = {};
    for (const filePath of filePaths) {
      if (this.ignoredFileList.some(ifp => path.resolve(filePath) === path.resolve(path.join(this.rootPath, ifp)))) continue;
      const fileContent = fs.readFileSync(filePath, "utf8");
      const getLayerLen = (str: string) => str.split(LANG_ENTRY_SPLIT_SYMBOL[this.langFormatType] as string).length;
      const isSameLayer = (str0: string, str1: string) => getLayerLen(str0) === getLayerLen(str1);
      const { tItems, existedItems } = catchAllEntries(fileContent, this.langFormatType, this.entryClassTree);
      const usedEntryList = existedItems.slice();
      if (usedEntryList.length > maxNum) {
        maxNum = usedEntryList.length;
        this.roguePath = filePath;
      }
      for (const item of tItems) {
        const filterList = totalEntryList.filter(entry => item.regex.test(entry) && isSameLayer(item.text, entry));
        if (filterList.length === 0) {
          this.undefinedEntryList.push({ ...item, path: filePath });
          this.undefinedEntryMap[item.text] ??= {};
          this.undefinedEntryMap[item.text][filePath] ??= [];
          this.undefinedEntryMap[item.text][filePath].push(item.pos);
        } else {
          usedEntryList.push(
            ...filterList.map(entryName => ({
              name: entryName,
              pos: item.pos
            }))
          );
        }
      }
      // usedEntryList = [...new Set(usedEntryList)];
      if (usedEntryList.length > 0) {
        const count = filePath.split("\\").length - 1;
        pathLevelCountMap[count] ??= 0;
        pathLevelCountMap[count]++;
        usedEntryList.forEach(entry => {
          this.usedEntryMap[entry.name] ??= {};
          this.usedEntryMap[entry.name][filePath] ??= [];
          if (!this.usedEntryMap[entry.name][filePath].includes(entry.pos)) {
            this.usedEntryMap[entry.name][filePath].push(entry.pos);
          }
        });
      }
    }
    let primaryPathLevel = 0;
    Object.entries(pathLevelCountMap).forEach(([key, value]) => {
      if (value > (pathLevelCountMap[primaryPathLevel] || 0)) {
        primaryPathLevel = Number(key);
      }
    });
    this.primaryPathLevel = primaryPathLevel;
  }

  private _readAllFiles(dir: string): string[] {
    const pathList: string[] = [];
    const results = fs.readdirSync(dir, { withFileTypes: true });
    for (let i = 0; i < results.length; i++) {
      const targetName = results[i].name;
      const tempPath = path.join(dir, targetName);
      const isLangDir = path.resolve(tempPath) === path.resolve(this.langDir);
      const ignoredDirList = ["dist", "node_modules", "img", "image", "css", "asset", "langChecker", ".vscode"];
      if (results[i].isDirectory() && ignoredDirList.every(name => !targetName.includes(name)) && !isLangDir) {
        const tempPathList = this._readAllFiles(tempPath);
        pathList.push(...tempPathList);
      }
      const ignoredNameList = ["jquery", "element", "qrcode", "underscore", "vant", "language", "vue.js"];
      if (
        !results[i].isDirectory() &&
        [".js", ".vue", ".html", ".jsx", ".ts", ".tsx"].some(type => targetName.endsWith(type)) &&
        ignoredNameList.every(name => !targetName.includes(name))
      ) {
        pathList.push(tempPath);
      }
    }
    return pathList;
  }

  private _genOverviewTable(): void {
    printTitle("生成概览");
    printInfo(`共成功检测 ${this.detectedLangList.length} 个语言文件，结果概览如下：`, "brain");
    const tableInfo: Record<string, Record<string, any>> = {};
    const getEntryTotal = (lang: string) => Object.keys(this.langCountryMap[lang]);
    tableInfo["所属语种"] = this._genOverviewTableRow(lang => getLangText(lang));
    tableInfo["已有条目"] = this._genOverviewTableRow(lang => getEntryTotal(lang).length);
    if (this.task === "check") {
      if (this.checkUnityFlag) {
        tableInfo["缺失条目"] = this._genOverviewTableRow(lang => this.lackInfo[lang].length);
        tableInfo["多余条目"] = this._genOverviewTableRow(lang => this.extraInfo[lang].length);
      }
      if (this.checkRepeatFlag) {
        tableInfo["同文条目"] = this._genOverviewTableRow(lang => Object.keys(this.singleLangRepeatTextInfo[lang]).length);
        const mtList = Object.values(this.multiLangRepeatTextInfo).flat();
        tableInfo["异语同文"] = this._genOverviewTableRow(lang => mtList.filter(item => item.includes(lang)).length);
      }
      if (this.globalFlag) {
        tableInfo["闲置条目"] = this._genOverviewTableRow(
          lang => getEntryTotal(lang).filter(entry => !Object.hasOwn(this.usedEntryMap, unescapeEntryName(entry))).length
        );
      }
    }
    console.table(tableInfo);
  }

  private _genOverviewTableRow(func: (lang: string) => string | number): Record<string, string> {
    let referFlagIcon = "🚩";
    if (this.checkStyleFlag) {
      const iconMap = {
        success: "🟢",
        puzzle: "🟡",
        shock: "🟠",
        error: "🔴"
      };
      referFlagIcon = iconMap[this._getScore(this.styleScore)] as string;
    }
    return this.detectedLangList.reduce((prev, cur) => {
      let name = this._getLangFileName(cur);
      name = this.referredLang === cur ? `${name} ${referFlagIcon}` : name;
      return { ...prev, [name]: func(cur) };
    }, {});
  }

  private _formatEntriesInTerminal(list: string[], showColor: boolean = true): string {
    return (
      list
        .slice(0, 100)
        .map(item => (showColor ? `\x1b[33m${item}\x1b[0m` : item))
        .join(", ") + (list.length > 100 ? "..." : "")
    );
  }

  private _genGoogleTranslateUrl(source: string, target: string, text: string): string {
    return `https://translate.google.com/?hl=zh-CN&sl=${source}&tl=${target}&text=${text}&op=translate`;
  }

  private _genRemoveRegex(entryList: string[]): string {
    if (this.langFormatType !== LANG_FORMAT_TYPE.nonObj) {
      return `.*"(${entryList.join("|")})"[\\s\\S]*?(,\\n|\\s*(?=\\}))`;
    } else {
      return `.*(${entryList.join("|")}).*?\\n`;
    }
  }

  private _getRelativePath(str: string = ""): string {
    const rootDir = path.resolve(this.langDir, "../..");
    return path.relative(rootDir, str) || "ROOT DIRECTORY";
  }

  private _getScore(str: number = 0): PrintType {
    if (str >= 0.85) return "success";
    if (str >= 0.6) return "puzzle";
    if (str >= 0.4) return "shock";
    return "error";
  }

  private _getLangFileName(str: string = ""): string {
    return `${str}.${this.langFileType}`;
  }
}

export default LangCheckRobot;
