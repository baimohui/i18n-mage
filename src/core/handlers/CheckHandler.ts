import { LangContextInternal } from "@/types";
import { printInfo, printTitle, formatEntriesInTerminal } from "@/utils/print";
import { getDetectedLangList } from "@/core/tools/contextTools";
import { PrintType } from "@/utils/print";
import { getLangText } from "@/utils/const";
import { unescapeString } from "@/utils/regex";

export class CheckHandler {
  constructor(private ctx: LangContextInternal) {}

  public run() {
    if (this.ctx.checkUnityFlag) this.checkUnity();
    if (this.ctx.checkRepeatFlag) this.checkRepeat();
    if (this.ctx.checkStyleFlag) this.checkStyle();
    if (this.ctx.globalFlag) this.checkUsage();
    this.genOverviewTable();
  }
  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public checkUnity() {
    const needFixFlag = this.ctx.task === "fix";
    if (!needFixFlag) {
      printTitle("检测各语种与参考语种的条目一致性");
    }
    this.detectedLangList.forEach(lang => {
      const translation = this.ctx.langCountryMap[lang];
      const missingTranslations: string[] = [];
      const nullTranslations: string[] = [];
      const pivotEntryList = this.ctx.syncBasedOnReferredEntries ? this.ctx.referredEntryList : Object.keys(this.ctx.langDictionary);
      pivotEntryList.forEach(key => {
        if (!Object.hasOwn(translation, key)) {
          missingTranslations.push(key);
        } else if (translation[key].trim() === "") {
          nullTranslations.push(key);
        }
      });
      if (missingTranslations.length > 0 && !needFixFlag) {
        printInfo(`语种 ${lang} 缺少条目：${formatEntriesInTerminal(missingTranslations)}`, "error");
      }
      this.ctx.lackInfo[lang] = missingTranslations;
      this.ctx.nullInfo[lang] = nullTranslations;

      const extraTranslations: string[] = [];
      if (this.ctx.syncBasedOnReferredEntries) {
        for (const key in translation) {
          if (!this.ctx.referredEntryList.includes(key)) {
            extraTranslations.push(key);
          }
        }
      }
      if (extraTranslations.length > 0 && !needFixFlag) {
        printInfo(`语种 ${lang} 多出条目：${formatEntriesInTerminal(extraTranslations)}`, "puzzle");
      }
      this.ctx.extraInfo[lang] = extraTranslations;

      if (missingTranslations.length === 0 && extraTranslations.length === 0 && !needFixFlag) {
        printInfo(`语种 ${lang} 条目保持一致！`, "success");
      }
    });
  }

  public checkRepeat() {
    printTitle("检测条目在不同语种的译文是否相同");
    let isTextRepeatedInEntriesInLangs = false;
    for (const key in this.ctx.langDictionary) {
      const list = Object.values(this.ctx.langDictionary[key]);
      const filterList = [...new Set(list)];
      if (list.length !== filterList.length) {
        isTextRepeatedInEntriesInLangs = true;
        this.ctx.multiLangRepeatTextInfo[key] = [];
        if (list.length > 1 && filterList.length === 1) {
          this.ctx.multiLangRepeatTextInfo[key].push(this.detectedLangList.join(","));
        } else {
          filterList.forEach(filterItem => {
            const repeatLangList = Object.keys(this.ctx.langDictionary[key]).filter(
              lang => this.ctx.langDictionary[key][lang] === filterItem
            );
            const isElWithPor = repeatLangList.every(lang => ["el", "por", "po"].some(langKey => lang.includes(langKey)));
            if (repeatLangList.length > 1 && !isElWithPor) {
              this.ctx.multiLangRepeatTextInfo[key].push(repeatLangList.join(","));
              printInfo(`${key} 在 ${repeatLangList.join("、")} 的译文相同：${filterItem}`, "puzzle");
            }
          });
        }
      }
    }
    if (!isTextRepeatedInEntriesInLangs) {
      printInfo("未检测到重复的译文！", "success");
    }
  }

  public checkStyle() {
    const classTotalNum = Object.keys(this.ctx.entryClassInfo).length;
    const layerInfo: Record<string, number> = {};
    for (const entryClass in this.ctx.entryClassInfo) {
      this.ctx.entryClassInfo[entryClass].layer.forEach(item => {
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
    printInfo("建议在条目命名上按功能或模块进行清晰简要的分类", this.getScore(layerScore));
    console.table(layerTable);
    this.ctx.styleScore = layerScore;
  }

  public checkUsage() {
    printTitle("检测条目是否使用");
    const unusedEntryList = this.ctx.referredEntryList
      .map(key => unescapeString(key))
      .filter(name => !Object.hasOwn(this.ctx.usedEntryMap, name));
    if (unusedEntryList.length > 0) {
      printInfo(`存在疑似未使用条目：${formatEntriesInTerminal(unusedEntryList)}`, "puzzle");
    }
    if (this.ctx.undefinedEntryList.length > 0) {
      const undefinedEntryList = [...new Set(this.ctx.undefinedEntryList.map(item => item.text))];
      printInfo(`存在疑似未定义条目：${formatEntriesInTerminal(undefinedEntryList)}`, "puzzle");
    }
    if (unusedEntryList.length === 0 && this.ctx.undefinedEntryList.length === 0) {
      printInfo("不存在疑似未定义或未使用的条目！", "success");
    }
  }

  public genOverviewTable() {
    printTitle("生成概览");
    printInfo(`共成功检测 ${this.detectedLangList.length} 个语言文件，结果概览如下：`, "brain");
    const tableInfo: Record<string, Record<string, any>> = {};
    const getEntryTotal = (lang: string) => Object.keys(this.ctx.langCountryMap[lang]);
    tableInfo["所属语种"] = this.genOverviewTableRow(lang => getLangText(lang) || "未知语种");
    tableInfo["已有条目"] = this.genOverviewTableRow(lang => getEntryTotal(lang).length);
    if (this.ctx.checkUnityFlag) {
      tableInfo["缺失条目"] = this.genOverviewTableRow(lang => this.ctx.lackInfo[lang].length);
      tableInfo["多余条目"] = this.genOverviewTableRow(lang => this.ctx.extraInfo[lang].length);
    }
    if (this.ctx.checkRepeatFlag) {
      tableInfo["同文条目"] = this.genOverviewTableRow(lang => Object.keys(this.ctx.singleLangRepeatTextInfo[lang]).length);
      const mtList = Object.values(this.ctx.multiLangRepeatTextInfo).flat();
      tableInfo["异语同文"] = this.genOverviewTableRow(lang => mtList.filter(item => item.includes(lang)).length);
    }
    if (this.ctx.globalFlag) {
      tableInfo["闲置条目"] = this.genOverviewTableRow(
        lang => getEntryTotal(lang).filter(key => !Object.hasOwn(this.ctx.usedEntryMap, unescapeString(key))).length
      );
    }
    console.table(tableInfo);
  }

  private genOverviewTableRow(func: (lang: string) => string | number): Record<string, string> {
    let referFlagIcon = "🚩";
    if (this.ctx.checkStyleFlag) {
      const iconMap = {
        success: "🟢",
        puzzle: "🟡",
        shock: "🟠",
        error: "🔴"
      };
      referFlagIcon = iconMap[this.getScore(this.ctx.styleScore)] as string;
    }
    return this.detectedLangList.reduce((prev, cur) => {
      let name = cur;
      name = this.ctx.referredLang === cur ? `${name} ${referFlagIcon}` : name;
      return { ...prev, [name]: func(cur) };
    }, {});
  }

  private getScore(str: number = 0): PrintType {
    if (str >= 0.85) return "success";
    if (str >= 0.6) return "puzzle";
    if (str >= 0.4) return "shock";
    return "error";
  }
}
