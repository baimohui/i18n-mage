const fs = require("fs");
const path = require("path");
const xlsx = require("node-xlsx");
const translateTo = require("./translator/index");
const { deleteFolderRecursive, createFolderRecursive } = require("./utils/fs");
const { printInfo, printTitle } = require("./utils/print");
const { LANG_FORMAT_TYPE, LANG_ENTRY_SPLIT_SYMBOL, getLangText, getLangCode, getLangIntro } = require("./utils/const");
const {
  getCaseType,
  getLangFileInfo,
  getIdByStr,
  validateLang,
  replaceAllEntries,
  escapeEntryName,
  unescapeEntryName,
  setValueByEscapedEntryName,
  getValueByAmbiguousEntryName,
  formatObjectToString,
  addEntries,
  catchAllEntries,
  deleteEntries
} = require("./utils/regex");

class LangCheckRobot {
  static #instance;
  #langFileType;
  #langFormatType;
  #langDictionary; // { "DOC_lbl_example": { "cn": "示例" } }
  #langCountryMap; // { "cn": { "DOC_lbl_example": "示例" } }
  #lackInfo;
  #extraInfo;
  #nullInfo;
  #referredEntryList;
  #singleLangRepeatTextInfo;
  #multiLangRepeatTextInfo;
  #entryClassTree;
  #entryClassInfo;
  #styleScore;
  #undefinedEntryList;
  #undefinedEntryMap;
  #usedEntryMap;
  #langIndents;
  #langFileExtraInfo;
  #primaryPathLevel;
  #roguePath;
  #isVacant;
  #langTree;
  #updatedEntryValueInfo;
  #patchedEntryIdList;

  constructor(options) {
    this.task = ""; // 当前执行任务
    this.langDir = ""; // 多语言文件所在的目录
    this.rootPath = ""; // 项目根目录
    this.checkUnityFlag = true; // 是否检查各个语种的翻译条目完全一致
    this.checkRepeatFlag = false; // 是否检查条目重复
    this.checkStyleFlag = false; // 是否检查条目命名风格
    this.excludedLangList = []; // 不参与检查的语种列表
    this.includedLangList = []; // 参与检查的语种列表
    this.ignoredFileList = []; // 忽略的文件列表
    this.referredLang = ""; // 用于参考的语种
    this.globalFlag = false; // 是否在项目全局检测修复
    this.rewriteFlag = false; // 排序和修复结果是否写入原文件
    this.exportDir = ""; // 结果导出目录
    this.cachePath = ""; // 缓存文件路径
    this.ignoreEmptyLangFile = true; // 是否跳过空文件
    this.langFileMinLength = 0; // 小于该字符数则被视作空文件
    this.sortWithTrim = false; // 按使用范围排序时是否移除疑似未使用变量
    this.showPreInfo = true; // 是否展示预检测信息
    this.importExcelFrom = ""; // 所需要导入的 excel 文件路径
    this.importSheetData = ""; // 所需要导入的 excel 文件 sheet 数据
    this.exportExcelTo = ""; // 所需要导出的 excel 文件路径
    this.clearCache = true; // 是否清空缓存
    this.credentials = {}; // 翻译服务账号信息
    this.syncBasedOnReferredEntries = false; // 是否根据参考语种同步其他语种
    this.modifyList = []; // 需要修改的条目列表
    this.trimNameList = []; // 需要清理的条目列表

    this._reset();
    this.setOptions(options);
  }

  static getInstance() {
    if (!LangCheckRobot.#instance) {
      LangCheckRobot.#instance = new LangCheckRobot();
    }
    return LangCheckRobot.#instance;
  }

  setOptions(options = {}) {
    if (Object.prototype.toString.call(options) === "[object Object]") {
      for (const [key, value] of Object.entries(options)) {
        if (["excludedLangList", "includedLangList"].includes(key)) {
          this[key] = value.map(lang => lang.split(".")[0]);
        } else if (key === "checkAimList") {
          this.checkUnityFlag = value.includes("unity");
          this.checkRepeatFlag = value.includes("repeat");
          this.checkStyleFlag = value.includes("style");
        } else if (Object.hasOwn(this, key)) {
          this[key] = value;
        }
      }
    }
  }

  async execute() {
    if (!this.#isVacant) {
      printInfo("检测器正忙，请稍后再试！", "brain");
    }
    try {
      this.#isVacant = false;
      console.time("本次耗时");
      this.clearCache && this._reset();
      await this._readLangFiles();
      if (this.detectedLangList.length === 0) {
        printInfo("请确认检测路径是否为多语言文件所在的目录！", "brain");
        return false;
      }
      if (this.globalFlag) {
        await this._startCensus();
      }
      switch (this.task) {
        case "check":
          this.checkUnityFlag && this._checkUnity();
          this.checkRepeatFlag && this._checkRepeat();
          this.checkStyleFlag && this._checkStyle();
          this.globalFlag && this._checkUsage();
          this._genOverviewTable();
          // this._getPopularClassList();
          break;
        case "fix":
          this._checkUnity();
          await this._handleFix();
          break;
        case "sort":
          this._handleSort();
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
    } catch (e) {
      printInfo(`检测中断，出现异常报错：${e.message}`, "demon");
      console.error(e);
      return false;
    } finally {
      this.#isVacant = true;
      console.timeEnd("本次耗时");
    }
  }

  get isProcessing() {
    return !this.#isVacant;
  }

  get detectedLangList() {
    const langKeys = Object.keys(this.#langCountryMap) ?? [];
    langKeys.sort((a, b) => this.includedLangList.indexOf(a) - this.includedLangList.indexOf(b));
    return langKeys;
  }

  get langDetail() {
    return {
      langList: this.detectedLangList,
      fileType: this.#langFileType,
      formatType: this.#langFormatType,
      dictionary: this.#langDictionary,
      lack: this.#lackInfo,
      extra: this.#extraInfo,
      null: this.#nullInfo,
      refer: this.#referredEntryList,
      countryMap: this.#langCountryMap,
      used: this.#usedEntryMap,
      undefined: this.#undefinedEntryMap,
      tree: this.#langTree
    };
  }

  _reset() {
    this.#langFormatType = "";
    this.#langFileType = "";
    this.#langDictionary = {};
    this.#langCountryMap = {};
    this.#lackInfo = {};
    this.#extraInfo = {};
    this.#nullInfo = {};
    this.#referredEntryList = [];
    this.#singleLangRepeatTextInfo = {};
    this.#multiLangRepeatTextInfo = {};
    this.#entryClassTree = {};
    this.#entryClassInfo = {};
    this.#styleScore = 0;
    this.#undefinedEntryList = [];
    this.#undefinedEntryMap = {};
    this.#usedEntryMap = {};
    this.#langIndents = {};
    this.#langFileExtraInfo = {};
    this.#primaryPathLevel = 0;
    this.#roguePath = "";
    this.#isVacant = true;
    this.#langTree = {};
    this.#updatedEntryValueInfo = {};
    this.#patchedEntryIdList = [];
  }

  async _readLangFiles() {
    this.#langFormatType = "";
    const files = await fs.readdirSync(this.langDir);
    const langTree = {};
    files.forEach(file => {
      if (![".js", ".json", ".ts"].includes(path.extname(file))) {
        this.showPreInfo && printInfo(`文件 ${file} 类型不符合规范，跳过检测！`, "ghost");
        return;
      }
      if (this.excludedLangList.some(lang => file.split(".")[0] !== lang)) {
        this.showPreInfo && printInfo(`文件 ${file} 所属语言被排除，跳过检测！`, "ghost");
        return;
      }
      if (this.includedLangList.length > 0 && this.includedLangList.every(lang => file.split(".")[0] !== lang)) {
        this.showPreInfo && printInfo(`文件 ${file} 所属语言被排除，跳过检测！`, "ghost");
        return;
      }
      let fileContents = fs.readFileSync(path.join(this.langDir, file), "utf8");
      if (this.ignoreEmptyLangFile && fileContents.length < this.langFileMinLength) {
        this.showPreInfo && printInfo(`文件 ${file} 疑似为空白文件，跳过检测！`, "ghost");
        return;
      }
      const fileInfo = getLangFileInfo(fileContents);
      if (!fileInfo || file.startsWith("index") || (this.#langFormatType && this.#langFormatType !== fileInfo.formatType)) {
        this.showPreInfo && printInfo(`文件 ${file} 格式不符合规范，跳过检测！`, "ghost");
        return;
      }
      const { formatType, content: langObj, indents, prefix, suffix, innerVar, keyQuotes, raw } = fileInfo;
      const [fileName, fileType] = file.split(".");
      this.#langFileType = fileType;
      this.#langFormatType = formatType;
      this.#langIndents[fileName] = indents;
      this.#langCountryMap[fileName] = langObj;
      this.#langFileExtraInfo[fileName] = { prefix, suffix, innerVar, keyQuotes };
      langTree[fileName] = raw;
    });
    function mergeTreesToTwoObjectsSemantic(trees, labels) {
      const structure = {}; // 对象A
      const lookup = {}; // 对象B
      // 在 structure 中按路径设置值
      function setAtPath(obj, path, value) {
        let cur = obj;
        for (let i = 0; i < path.length - 1; i++) {
          const key = path[i];
          if (!cur[key] || typeof cur[key] !== "object") {
            cur[key] = {};
          }
          cur = cur[key];
        }
        cur[path[path.length - 1]] = value;
      }
      function traverse(node, path, label) {
        if (typeof node === "string") {
          // 将路径数组编码为语义化 id，转义键中的 "\" 和 "."
          const id = path.map(key => escapeEntryName(key)).join(".");
          setAtPath(structure, path, id);
          if (!Object.hasOwn(lookup, id)) {
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
      this.referredLang = this.detectedLangList.find(item => item.includes(this.referredLang));
      const { structure, lookup } = mergeTreesToTwoObjectsSemantic(Object.values(langTree), Object.keys(langTree));
      this.#langTree = structure;
      this.#langDictionary = lookup;
      if (!this.referredLang) {
        // TODO 中英文判定逻辑待优化
        const cnName = this.detectedLangList.find(a => ["cn", "zh"].some(b => a.startsWith(b)));
        const enName = this.detectedLangList.find(a => a.startsWith("en"));
        this.referredLang = cnName || enName || this.detectedLangList[0];
      }
      this.#referredEntryList = [...new Set(this.#referredEntryList.concat(Object.keys(this.#langCountryMap[this.referredLang])))];
      Object.keys(this.#langDictionary).forEach(entry => this._genEntryClassTree(unescapeEntryName(entry)));
    }
  }

  _checkUnity() {
    const needFixFlag = this.task === "fix";
    !needFixFlag && printTitle("检测各语种与参考语种的条目一致性");
    this.detectedLangList.forEach(lang => {
      const translation = this.#langCountryMap[lang];
      const missingTranslations = [];
      const nullTranslations = [];
      const pivotEntryList = this.syncBasedOnReferredEntries ? this.#referredEntryList : Object.keys(this.#langDictionary);
      pivotEntryList.forEach(entry => {
        if (!Object.hasOwn(translation, entry)) {
          missingTranslations.push(entry);
        } else if (!translation[entry]) {
          nullTranslations.push(entry);
        }
      });
      const langName = this._getLangFileName(lang);
      if (missingTranslations.length > 0 && !needFixFlag) {
        printInfo(`文件 ${langName} 缺少条目：${this._formatEntriesInTerminal(missingTranslations)}`, "error");
      }
      this.#lackInfo[lang] = missingTranslations;
      this.#nullInfo[lang] = nullTranslations;

      const extraTranslations = [];
      if (this.syncBasedOnReferredEntries) {
        for (const entry in translation) {
          !this.#referredEntryList.includes(entry) && extraTranslations.push(entry);
        }
      }
      if (extraTranslations.length > 0 && !needFixFlag) {
        printInfo(`文件 ${langName} 多出条目：${this._formatEntriesInTerminal(extraTranslations)}`, "puzzle");
      }
      this.#extraInfo[lang] = extraTranslations;

      if (missingTranslations.length === 0 && extraTranslations.length === 0 && !needFixFlag) {
        printInfo(`文件 ${langName} 条目保持一致！`, "success");
      }
    });
  }

  _checkRepeat() {
    printTitle("检测条目在不同语种的译文是否相同");
    let isTextRepeatedInEntriesInLangs = false;
    for (const entry in this.#langDictionary) {
      const list = Object.values(this.#langDictionary[entry]);
      const filterList = [...new Set(list)];
      if (list.length !== filterList.length) {
        isTextRepeatedInEntriesInLangs = true;
        this.#multiLangRepeatTextInfo[entry] = [];
        if (list.length > 1 && filterList.length === 1) {
          // printInfo(`${entry} 在所有语种的译文完全相同：${filterList[0]}`, "shock");
          this.#multiLangRepeatTextInfo[entry].push(this.detectedLangList.join(","));
        } else {
          filterList.forEach(filterItem => {
            const repeatLangList = Object.keys(this.#langDictionary[entry]).filter(
              lang => this.#langDictionary[entry][lang] === filterItem
            );
            const isElWithPor = repeatLangList.every(lang => ["el", "por", "po"].some(langKey => lang.includes(langKey)));
            if (repeatLangList.length > 1 && !isElWithPor) {
              this.#multiLangRepeatTextInfo[entry].push(repeatLangList.join(","));
              printInfo(`${entry} 在 ${repeatLangList.join("、")} 的译文相同：${filterItem}`, "puzzle");
            }
          });
        }
      }
    }
    if (!isTextRepeatedInEntriesInLangs) {
      printInfo("未检测到重复的译文！", "success");
    }

    printTitle("检测同一语种是否存在译文相同的条目");
    this.detectedLangList.forEach(lang => {
      const isReferredLang = lang === this.referredLang;
      let isTextRepeatedInEntries = false;
      const repeatTextObj = {};
      const langMap = this.#langCountryMap[lang];
      this.#singleLangRepeatTextInfo[lang] = {};
      for (let entry in langMap) {
        const text = langMap[entry];
        if (text) {
          repeatTextObj[text] = (repeatTextObj[text] ?? []).concat(entry);
        }
      }
      const langName = this._getLangFileName(lang);
      for (const [key, value] of Object.entries(repeatTextObj)) {
        if (value.length > 1) {
          isTextRepeatedInEntries = true;
          this.#singleLangRepeatTextInfo[lang][key] = value;
          isReferredLang && printInfo(`参考文件 ${langName} 中 ${value.join(", ")} 的译文相同：${key}`, "puzzle");
        }
      }
      if (!isTextRepeatedInEntries) {
        isReferredLang && printInfo(`参考文件 ${langName} 条目译文独一无二`, "success");
      }
    });
  }

  _checkStyle() {
    const classTotalNum = Object.keys(this.#entryClassInfo).length;
    const layerInfo = {};
    for (let entryClass in this.#entryClassInfo) {
      this.#entryClassInfo[entryClass].layer.forEach(item => {
        let layer = item - 1;
        layer = layer === 0 ? "none" : layer;
        layerInfo[layer] ??= 0;
        layerInfo[layer]++;
      });
    }
    printTitle("检测条目分类层级风格");
    const layerTable = {};
    const layerNumInfo = {};
    const layerRatioInfo = {};
    const layerKeys = Object.keys(layerInfo).sort();
    layerKeys.forEach(key => {
      const layerName = `${key == "none" ? "未" : key + " 级"}分类`;
      layerNumInfo[layerName] = layerInfo[key];
      layerRatioInfo[layerName] = ((layerInfo[key] / classTotalNum) * 100).toFixed(2) + "%";
    });
    layerTable["数量"] = layerNumInfo;
    layerTable["占比"] = layerRatioInfo;
    delete layerInfo.none;
    const layerScore =
      Object.values(layerInfo)
        .sort((a, b) => (a >= b ? -1 : 1))
        .slice(0, 2)
        .reduce((prev, cur) => prev + cur, 0) / classTotalNum;
    printInfo("建议在条目命名上按功能或模块进行清晰简要的分类", this._getScore(layerScore));
    console.table(layerTable);
    this.#styleScore = layerScore;
  }

  _handleSort() {
    printTitle(`对条目按${this.globalFlag ? "使用范围" : "首字母"}进行排序`);
    const pathMap = {};
    const allCommonEntryList = [];
    let usedEntryMap = Object.entries(this.#usedEntryMap).reduce((entryMap, [key, value]) => {
      entryMap[key] = Object.keys(value);
      return entryMap;
    }, {});
    if (this.#langFormatType === LANG_FORMAT_TYPE.nestedObj && this.globalFlag) {
      printInfo("嵌套对象形式的多语言不支持按使用范围排序", "brain");
      usedEntryMap = {};
    }
    for (let entry in usedEntryMap) {
      const detectedPaths = [...new Set(usedEntryMap[entry].map(item => item.split("\\").slice(0, -1).join("\\")))];
      let pathKey = detectedPaths[0];
      if (detectedPaths.length > 1) {
        const commonPathBlockList = [];
        const pathBlockList = detectedPaths.map(item => item.split("\\"));
        let matchIndex = 0;
        while (pathBlockList.every(item => item[matchIndex] === pathBlockList[0][matchIndex])) {
          commonPathBlockList.push(pathBlockList[0][matchIndex]);
          matchIndex++;
        }
        const pathBlockLen = commonPathBlockList.length;
        const isAllPrimary = pathBlockList.every(item => item.length >= this.#primaryPathLevel - 1);
        const backupPath = detectedPaths.find(item => item.split("\\").length >= this.#primaryPathLevel - 1);
        if (pathBlockLen >= this.#primaryPathLevel - 1) {
          pathKey = commonPathBlockList.join("\\");
        } else if (detectedPaths.length === 2) {
          if (backupPath && !isAllPrimary) {
            pathKey = backupPath;
          } else if (isAllPrimary) {
            pathKey = detectedPaths[this.#roguePath.startsWith(detectedPaths[0]) ? 1 : 0];
          } else {
            allCommonEntryList.push(entry);
            continue;
          }
        } else {
          allCommonEntryList.push(entry);
          continue;
        }
      }
      pathMap[pathKey] ??= [];
      pathMap[pathKey].push(entry);
    }
    allCommonEntryList.sort().sort((a, b) => (usedEntryMap[a].length > usedEntryMap[b].length ? -1 : 1));
    const pathClassList = Object.keys(pathMap).sort();
    const writeList = [];
    for (let lang in this.#langCountryMap) {
      const langObj = this.#langCountryMap[lang];
      const langObjKeys = Object.keys(langObj);
      const pageData = [];
      const commonEntryList = allCommonEntryList.filter(entry => Object.hasOwn(langObj, entry));
      if (commonEntryList.length > 0) {
        pageData.push({
          desc: "COMMON",
          value: commonEntryList.map(entry => ({ name: entry, value: langObj[entry] }))
        });
      }
      pathClassList.forEach(pathClass => {
        const relativePath = this._getRelativePath(pathClass);
        const entryList = pathMap[pathClass].filter(entry => Object.hasOwn(langObj, entry)).sort();
        if (entryList.length > 0) {
          pageData.push({ desc: relativePath, value: entryList.map(entry => ({ name: entry, value: langObj[entry] })) });
        }
      });
      const unusedEntryList = langObjKeys.filter(entry => !Object.hasOwn(usedEntryMap, entry)).sort();
      if (unusedEntryList.length > 0 && !this.sortWithTrim) {
        pageData.push({
          desc: this.#langFormatType !== LANG_FORMAT_TYPE.nestedObj && this.globalFlag ? "UNUSED?" : "",
          value: unusedEntryList.map(entry => ({ name: entry, value: langObj[entry] }))
        });
      }
      writeList.push({
        name: lang,
        value: replaceAllEntries({
          data: pageData,
          langType: this.#langFormatType,
          indents: this.#langIndents[lang],
          extraInfo: this.#langFileExtraInfo[lang]
        })
      });
    }
    let outputPath = path.join(this.exportDir, "sortResult");
    deleteFolderRecursive(outputPath);
    if (writeList.length > 0) {
      if (this.rewriteFlag) {
        outputPath = this.langDir;
      } else {
        createFolderRecursive(outputPath);
      }
      writeList.forEach(item => {
        const filePath = path.join(outputPath, this._getLangFileName(item.name));
        fs.writeFileSync(filePath, item.value);
      });
      printInfo(`排序结果已导出到 ${outputPath} 目录`, "rocket");
    } else {
      printInfo("排序失败！", "error");
    }
  }

  async _handleExport() {
    printTitle("导出翻译");
    if (!this.exportExcelTo) {
      printInfo("导出文件路径不存在！", "brain");
      return;
    }

    const tableData = [["Label", ...this.detectedLangList.map(item => getLangText(item, "en"))]];
    for (const entry in this.#langDictionary) {
      const itemList = [entry];
      const langObj = this.#langDictionary[entry];
      this.detectedLangList.forEach(lang => {
        itemList.push(langObj[lang]);
      });
      tableData.push(itemList);
    }
    const sheetOptions = { "!cols": [{ wch: 24 }, ...Array.from({ length: this.detectedLangList.length }, () => ({ wch: 48 }))] };
    const buffer = await xlsx.build([{ name: "Sheet1", data: tableData, options: {} }], { sheetOptions });
    // TODO 非管理员模式创建文件会带锁
    fs.writeFileSync(this.exportExcelTo, buffer);
    fs.writeFileSync(this.exportExcelTo.replace(".xlsx", "New.xlsx"), buffer);
    printInfo(`翻译表格已导出到 ${this.exportExcelTo} 路径`, "rocket");
  }

  _handleImport() {
    printTitle("导入翻译");
    if (!fs.existsSync(this.importExcelFrom)) {
      printInfo("导入文件路径不存在！", "brain");
      return;
    }
    const sheetNeeds = this.importSheetData.split(";").reduce((prev, cur) => {
      if (cur === "") return prev;
      const [sheet, langStr] = cur.split(":");
      prev[sheet] = langStr ? langStr.split(",") : true;
      return prev;
    }, {});
    const excelData = xlsx.parse(this.importExcelFrom);
    const modifiedLangList = [];
    for (let sheetIndex = 0; sheetIndex < excelData.length; sheetIndex++) {
      if (this.importSheetData && !sheetNeeds[sheetIndex]) continue;
      const sheetData = excelData[sheetIndex].data;
      const [headInfo] = sheetData.splice(0, 1);
      if (!headInfo) continue;
      const headLen = headInfo.length;
      for (let i = 0; i <= headLen; i++) {
        if (typeof headInfo[i] !== "string") {
          headInfo[i] = "NULL";
        } else {
          headInfo[i] = headInfo[i].trim();
        }
      }
      printInfo(
        `检测到表格内有效的语言列为：${
          headInfo
            .map(item => getLangIntro(item).cnName)
            .filter(item => !!item)
            .join("、") || "无"
        }`,
        "brain"
      );
      const labelIndex = headInfo.findIndex(item => item && item.toLowerCase() === "label");
      sheetData.forEach(item => {
        const entryName = item[labelIndex]?.trim() ?? "";
        if (Object.hasOwn(this.#langDictionary, entryName)) {
          const entry = this.#langDictionary[entryName];
          const langList = Array.isArray(sheetNeeds[sheetIndex]) ? sheetNeeds[sheetIndex] : this.detectedLangList;
          langList.forEach(lang => {
            const langAlias = Object.values(getLangIntro(lang));
            !langAlias.includes(lang) && langAlias.push(lang);
            const langInfo = this.#langCountryMap[lang];
            const langText = item[headInfo.findIndex(item => langAlias.some(alias => alias.toLowerCase() === item.toLowerCase()))];
            if (langText && langInfo[entryName] !== langText) {
              printInfo(
                `条目 ${entryName} ${getLangText(lang)}更改：\x1b[31m${langInfo[entryName]}\x1b[0m -> \x1b[32m${langText}\x1b[0m`,
                "mage"
              );
              entry[lang] = langText;
              langInfo[entryName] = langText;
              if (!modifiedLangList.includes(lang)) {
                modifiedLangList.push(lang);
              }
            }
          });
        }
      });
    }
    modifiedLangList.forEach(lang => {
      const filePath = path.join(this.langDir, this._getLangFileName(lang));
      const langData = Object.entries(this.#langCountryMap[lang]).map(([name, value]) => ({ name, value }));
      fs.writeFileSync(
        filePath,
        replaceAllEntries({
          data: [{ desc: "", value: langData }],
          langType: this.#langFormatType,
          indents: this.#langIndents[lang],
          extraInfo: this.#langFileExtraInfo[lang]
        })
      );
    });
    if (modifiedLangList.length === 0) {
      printInfo("未检测到文案变动的条目", "success");
    }
  }

  async _handleModify() {
    printTitle("修改翻译条目");
    this.modifyList.forEach(item => {
      const { name, value, lang } = item;
      const entryName = getValueByAmbiguousEntryName(this.#langTree, name);
      entryName && this._setUpdatedEntryValueInfo(entryName, value, lang);
    });
    this.rewriteFlag && this._handleRewrite();
  }

  _handleTrim() {
    printTitle("清理翻译条目");
    if (this.trimNameList.length > 0) {
      this.trimNameList.forEach(name => {
        this._setUpdatedEntryValueInfo(name, undefined);
      });
      this.rewriteFlag && this._handleRewrite();
    } else {
      printInfo("未检测到需要清理的翻译条目！", "success");
    }
  }

  async _handleFix() {
    printTitle(`补充翻译${this.globalFlag ? "与修正条目" : ""}`);
    // 处理未定义的翻译条目
    if (this.#undefinedEntryList.length > 0) {
      await this._processUndefinedEntries();
    }
    // 补充缺失的翻译
    const needTranslate = await this._fillMissingTranslations();
    !needTranslate && printInfo("翻译齐全，无需补充！", "success");
    this.rewriteFlag && this._handleRewrite();
  }

  _handleRewrite() {
    printTitle("写入翻译条目");
    for (const [lang, entryInfo] of Object.entries(this.#updatedEntryValueInfo)) {
      for (const [entry, value] of Object.entries(entryInfo)) {
        this._updateEntryValue(entry, value, lang);
      }
      this._rewriteTranslationFile(lang);
    }
    // 修正全局条目
    this._applyGlobalFixes();
  }

  async _processUndefinedEntries() {
    const referredLangCode = getLangCode(this.referredLang);
    const referredLangMap = this.#langCountryMap[this.referredLang];
    const valueKeyMap = Object.keys(referredLangMap).reduce((prev, cur) => ({ ...prev, [getIdByStr(referredLangMap[cur])]: cur }), {});
    const needTranslateList = [];
    this.#undefinedEntryList.forEach(entry => {
      if (valueKeyMap[entry.id]) {
        const isFixed = needTranslateList.every(item => item.id !== entry.id);
        if (isFixed) {
          entry.name = valueKeyMap[entry.id];
          entry.fixedRaw = this._getFixedRaw(entry, entry.name);
        }
        this.#patchedEntryIdList.push(entry);
      } else if (validateLang(entry.text, getLangCode(this.referredLang))) {
        valueKeyMap[entry.id] = entry.text;
        needTranslateList.push(entry);
      }
    });
    let enNameList = needTranslateList.map(entry => entry.text);
    const enLang = this.detectedLangList.find(item => getLangCode(item) === "en");
    if (enNameList.length > 0) {
      if (referredLangCode !== "en") {
        const res = await translateTo({
          source: this.referredLang,
          target: "en",
          sourceTextList: enNameList,
          credentials: this.credentials
        });
        if (res.success) {
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
    needTranslateList.forEach((entry, index) => {
      let id = getIdByStr(enNameList[index], true);
      let entryName = "";
      if (entry.name && !this.#referredEntryList.includes(entry.name)) {
        entryName = entry.name;
      } else {
        if (entry.class && !entry.class.endsWith(LANG_ENTRY_SPLIT_SYMBOL[this.#langFormatType])) {
          entry.class += LANG_ENTRY_SPLIT_SYMBOL[this.#langFormatType];
        }
        const entryPrefix = entry.class || namePrefix;
        if (id.length > 40) {
          let index = 0;
          id = `${entry.path.match(/([a-zA-Z0-9]+)\./)[1]}Text`;
          while (referredLangMap[entryPrefix + id + String(index).padStart(2, "0")]) {
            index++;
          }
          id = id + String(index).padStart(2, "0");
        }
        entryName = entryPrefix + id;
      }
      entry.name = entryName;
      entry.fixedRaw = this._getFixedRaw(entry, entryName);
      this.#patchedEntryIdList.push(entry);
      referredLangMap[entryName] = entry.text;
      this.detectedLangList.forEach(lang => {
        // if (lang === this.referredLang) {
        //   this._updateEntryValue(entryName, entry.text, lang);
        // } else if (lang === enLang) {
        //   this._updateEntryValue(entryName, enNameList[index], lang);
        // }
        if ([this.referredLang, enLang].includes(lang)) {
          this.#updatedEntryValueInfo[lang] ??= {};
          this.#updatedEntryValueInfo[lang][entryName] = lang === this.referredLang ? entry.text : enNameList[index];
        }
        this.#lackInfo[lang] ??= [];
        this.#lackInfo[lang].push(entryName);
      });
    });
  }

  async _fillMissingTranslations() {
    let needTranslate = false;
    for (const lang in this.#lackInfo) {
      const referredLangMap = this.#langCountryMap[this.referredLang];
      const lackEntries = this.#lackInfo[lang].filter(entry => referredLangMap[entry]);
      if (lackEntries.length > 0) {
        needTranslate = true;
        const referredEntriesText = lackEntries.map(entry => referredLangMap[entry]);
        const res = await translateTo({
          source: this.referredLang,
          target: lang,
          sourceTextList: referredEntriesText,
          credentials: this.credentials
        });
        if (res.success) {
          this._printAddedText(lang, res.data, res.api);
          lackEntries.forEach((entryName, index) => {
            // this._updateEntryValue(entryName, res.data[index], lang);
            this._setUpdatedEntryValueInfo(entryName, res.data[index], lang);
          });
        } else {
          printInfo(res.message, "error");
        }
      }
    }
    return needTranslate;
  }

  _applyGlobalFixes() {
    const globalFixMap = {};
    this.#patchedEntryIdList.forEach(entry => {
      if (!entry.fixedRaw) {
        const fixedEntryId = this.#patchedEntryIdList.filter(item => item.id === entry.id && item.fixedRaw)[0]?.name || entry.text;
        entry.name = fixedEntryId;
        entry.fixedRaw = this._getFixedRaw(entry, fixedEntryId);
      }
      globalFixMap[entry.path] ??= [];
      globalFixMap[entry.path].push(entry);
    });
    for (const fixPath in globalFixMap) {
      let fileContent = fs.readFileSync(fixPath, "utf8");
      const fixList = globalFixMap[fixPath];
      fixList.forEach(item => {
        fileContent = fileContent.replaceAll(item.raw, item.fixedRaw);
      });
      fs.writeFileSync(fixPath, fileContent);
      const fixedEntries = this._formatEntriesInTerminal(
        fixList.map(item => `\x1b[31m${item.text}\x1b[0m -> \x1b[32m${item.name}\x1b[0m`),
        false
      );
      printInfo(`文件 ${this._getRelativePath(fixPath)} 修正条目：${fixedEntries}`, "mage");
    }
  }

  _setUpdatedEntryValueInfo(name, value, lang) {
    const langList = Object.keys(this.#langCountryMap).filter(item => !lang || item === lang);
    langList.forEach(lang => {
      this.#updatedEntryValueInfo[lang] ??= {};
      this.#updatedEntryValueInfo[lang][name] = value;
    });
  }

  _updateEntryValue(name, value, lang) {
    if (typeof value === "string") {
      if (this.#langDictionary[name]) {
        this.#langDictionary[name][lang] = value;
      } else {
        this.#langDictionary[name] = { [lang]: value };
      }
      this.#langCountryMap[lang][name] = value;
      setValueByEscapedEntryName(this.#langTree, name, name);
    } else {
      delete this.#langDictionary[name][lang];
      delete this.#langCountryMap[lang][name];
      setValueByEscapedEntryName(this.#langTree, name, undefined);
    }
  }

  _rewriteTranslationFile(lang) {
    const filePath = path.join(this.langDir, this._getLangFileName(lang));
    const fileContent = formatObjectToString(
      this.#langCountryMap[lang],
      this.#langFileType,
      this.#langIndents[lang],
      this.#langFileExtraInfo[lang]
    );
    fs.writeFileSync(filePath, fileContent);
    printInfo(`文件 ${this._getLangFileName(lang)} 翻译已写入`, "rocket");
  }

  _writeTranslationFiles(writeList = []) {
    let outputPath = path.join(this.exportDir, "fixResult");
    deleteFolderRecursive(outputPath);
    if (this.rewriteFlag) {
      outputPath = this.langDir;
    } else {
      createFolderRecursive(outputPath);
    }
    writeList.forEach(item => {
      let raw = "";
      const filePath = path.join(outputPath, this._getLangFileName(item.name));
      if (fs.existsSync(filePath)) {
        raw = fs.readFileSync(filePath, "utf8");
        raw = deleteEntries({ data: item.lackEntries, raw });
        raw = addEntries({
          raw,
          data: item.value,
          langType: this.#langFormatType,
          indents: raw.length >= this.langFileMinLength ? this.#langIndents[item.name] : this.#langIndents[this.referredLang],
          skipLineNum: this.#langFileExtraInfo[item.name]?.innerVar?.match(/\n/g)?.length ?? 0
        });
      } else {
        raw = replaceAllEntries({
          data: [{ value: item.value }],
          langType: this.#langFormatType,
          indents: this.#langIndents[item.name] || this.#langIndents[this.referredLang],
          extraInfo: this.#langFileExtraInfo[item.name]
        });
      }
      fs.writeFileSync(filePath, raw);
    });
    printInfo(`修复结果已导出到 ${outputPath} 目录`, "rocket");
  }

  _getFixedRaw(entry, name) {
    if (this.#langFormatType === LANG_FORMAT_TYPE.nonObj) {
      return name;
    } else {
      const tempVar = entry.var || {};
      const varList = Object.entries(tempVar).map(item => `${item[0]}: ${item[1]}`);
      const varStr = varList.length > 0 ? `, { ${varList.join(", ")} }` : "";
      const quote = entry.raw.match(/["'`]{1}/)[0];
      return `${entry.raw[0]}t(${quote}${name}${quote}${varStr})`;
    }
  }

  _printAddedText(lang, textList, api) {
    printInfo(
      `文件 ${this._getLangFileName(lang)} 补充${api ? ` ${api} ` : ""}翻译：${textList
        .map(item => `\x1b[36m${item.replaceAll(/\n/g, "\\n")}\x1b[0m`)
        .join(", ")}`,
      "mage"
    );
  }

  _genEntryClassTree(entry = "") {
    const splitSymbol = LANG_ENTRY_SPLIT_SYMBOL[this.#langFormatType];
    const structure = entry.split(splitSymbol);
    const structureLayer = structure.length;
    const primaryClass = structure[0];
    if (Object.hasOwn(this.#entryClassInfo, primaryClass)) {
      const classInfo = this.#entryClassInfo[primaryClass];
      classInfo.num++;
      !classInfo.layer.includes(structureLayer) && classInfo.layer.push(structureLayer);
    } else {
      this.#entryClassInfo[primaryClass] = { num: 1, layer: [structureLayer], case: getCaseType(primaryClass), childrenCase: {} };
    }
    let tempObj = this.#entryClassTree;
    structure.forEach((key, index) => {
      if (!tempObj[key]) {
        if (structureLayer > index + 1) {
          tempObj[key] = {};
        } else {
          tempObj[key] = null;
          const keyCase = getCaseType(key);
          const childrenCase = this.#entryClassInfo[primaryClass].childrenCase;
          childrenCase[keyCase] ??= 0;
          childrenCase[keyCase]++;
        }
      }
      tempObj = tempObj[key];
    });
  }

  _getPopularClassMap(tree, map = {}, classPrefix = "") {
    const splitSymbol = LANG_ENTRY_SPLIT_SYMBOL[this.#langFormatType];
    for (const [key, value] of Object.entries(tree)) {
      const itemName = classPrefix + key + splitSymbol;
      if (value) {
        map[itemName] = Object.keys(value).length;
        this._getPopularClassMap(value, map, itemName);
      }
    }
    return map;
  }

  _getPopularClassList() {
    const map = this._getPopularClassMap(this.#entryClassTree);
    return Object.keys(map)
      .sort((a, b) => (map[a] > map[b] ? -1 : 1))
      .map(item => ({ name: item, value: map[item] }));
  }

  _checkUsage() {
    printTitle("检测条目是否使用");
    const unusedEntryList = this.#referredEntryList.map(name => unescapeEntryName(name)).filter(entry => !this.#usedEntryMap[entry]);
    if (unusedEntryList.length > 0) {
      printInfo(`存在疑似未使用条目：${this._formatEntriesInTerminal(unusedEntryList)}`, "puzzle");
    }
    if (this.#undefinedEntryList.length > 0) {
      const undefinedEntryList = [...new Set(this.#undefinedEntryList.map(item => item.text))];
      printInfo(`存在疑似未定义条目：${this._formatEntriesInTerminal(undefinedEntryList)}`, "puzzle");
    }
    if (unusedEntryList.length === 0 && this.#undefinedEntryList.length === 0) {
      printInfo("不存在疑似未定义或未使用的条目！", "success");
    }
  }

  async _startCensus() {
    this.showPreInfo && printInfo("正在对条目进行全局捕获，这可能需要一点时间...", "brain");
    const filePaths = await this._readAllFiles(this.rootPath);
    const pathLevelCountMap = {};
    let maxNum = 0;
    const totalEntryList = Object.keys(this.#langDictionary).map(key => unescapeEntryName(key));
    this.#undefinedEntryList = [];
    this.#undefinedEntryMap = {};
    for (const filePath of filePaths) {
      if (this.ignoredFileList.some(ifp => path.resolve(filePath) === path.resolve(path.join(this.rootPath, ifp)))) continue;
      const fileContent = await fs.readFileSync(filePath, "utf8");
      const getLayerLen = str => str.split(LANG_ENTRY_SPLIT_SYMBOL[this.#langFormatType]).length;
      const isSameLayer = (str0, str1) => getLayerLen(str0) === getLayerLen(str1);
      const { tItems, existedItems } = catchAllEntries(fileContent, this.#langFormatType, this.#entryClassTree);
      let usedEntryList = existedItems.slice();
      if (usedEntryList.length > maxNum) {
        maxNum = usedEntryList.length;
        this.#roguePath = filePath;
      }
      for (const item of tItems) {
        const filterList = totalEntryList.filter(entry => item.regex.test(entry) && isSameLayer(item.text, entry));
        if (filterList.length === 0) {
          this.#undefinedEntryList.push({ ...item, path: filePath });
          this.#undefinedEntryMap[item.text] ??= {};
          this.#undefinedEntryMap[item.text][filePath] ??= [];
          this.#undefinedEntryMap[item.text][filePath].push(item.pos);
        } else {
          usedEntryList.push(...filterList.map(entryName => ({ name: entryName, pos: item.pos })));
        }
      }
      usedEntryList = [...new Set(usedEntryList)];
      if (usedEntryList.length > 0) {
        const count = filePath.split("\\").length - 1;
        pathLevelCountMap[count] ??= 0;
        pathLevelCountMap[count]++;
        usedEntryList.forEach(entry => {
          this.#usedEntryMap[entry.name] ??= {};
          this.#usedEntryMap[entry.name][filePath] ??= [];
          if (!this.#usedEntryMap[entry.name][filePath].includes(entry.pos)) {
            this.#usedEntryMap[entry.name][filePath].push(entry.pos);
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
    this.#primaryPathLevel = primaryPathLevel;
  }

  async _readAllFiles(dir) {
    const pathList = [];
    const results = await fs.readdirSync(dir, { withFileTypes: true });
    for (let i = 0; i < results.length; i++) {
      const targetName = results[i].name;
      const tempPath = path.join(dir, targetName);
      const isLangDir = path.resolve(tempPath) === path.resolve(this.langDir);
      const ignoredDirList = ["dist", "node_modules", "img", "image", "css", "asset", "langChecker", ".vscode"];
      if (results[i].isDirectory() && ignoredDirList.every(name => !targetName.includes(name)) && !isLangDir) {
        const tempPathList = await this._readAllFiles(tempPath);
        pathList.push(...tempPathList);
      }
      // TODO 忽略名称列表待完善
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

  _genOverviewTable() {
    printTitle("生成概览");
    printInfo(`共成功检测 ${this.detectedLangList.length} 个语言文件，结果概览如下：`, "brain");
    const tableInfo = {};
    const getEntryTotal = lang => Object.keys(this.#langCountryMap[lang]);
    tableInfo["所属语种"] = this._genOverviewTableRow(lang => getLangText(lang));
    tableInfo["已有条目"] = this._genOverviewTableRow(lang => getEntryTotal(lang).length);
    if (this.task === "check") {
      if (this.checkUnityFlag) {
        tableInfo["缺失条目"] = this._genOverviewTableRow(lang => this.#lackInfo[lang].length);
        tableInfo["多余条目"] = this._genOverviewTableRow(lang => this.#extraInfo[lang].length);
      }
      if (this.checkRepeatFlag) {
        // tableInfo["同名条目"] = this._genOverviewTableRow(lang => Object.keys(this.#repeatEntryNameInfo[lang]).length);
        tableInfo["同文条目"] = this._genOverviewTableRow(lang => Object.keys(this.#singleLangRepeatTextInfo[lang]).length);
        const mtList = Object.values(this.#multiLangRepeatTextInfo).flat();
        tableInfo["异语同文"] = this._genOverviewTableRow(lang => mtList.filter(item => item.includes(lang)).length);
      }
      if (this.globalFlag) {
        tableInfo["闲置条目"] = this._genOverviewTableRow(
          lang => getEntryTotal(lang).filter(entry => !this.#usedEntryMap[unescapeEntryName(entry)]).length
        );
      }
    }
    console.table(tableInfo);
  }

  _genOverviewTableRow(func) {
    let referFlagIcon = "🚩";
    if (this.checkStyleFlag) {
      const iconMap = { success: "🟢", puzzle: "🟡", shock: "🟠", error: "🔴" };
      referFlagIcon = iconMap[this._getScore(this.#styleScore)];
    }
    return this.detectedLangList.reduce((prev, cur) => {
      let name = this._getLangFileName(cur);
      name = this.referredLang === cur ? `${name} ${referFlagIcon}` : name;
      return { ...prev, [name]: func(cur) };
    }, {});
  }

  _formatEntriesInTerminal(list, showColor = true) {
    return (
      list
        .slice(0, 100)
        .map(item => (showColor ? `\x1b[33m${item}\x1b[0m` : item))
        .join(", ") + (list.length > 100 ? "..." : "")
    );
  }

  _genGoogleTranslateUrl(source, target, text) {
    return `https://translate.google.com/?hl=zh-CN&sl=${source}&tl=${target}&text=${text}&op=translate`;
  }

  _genRemoveRegex(entryList) {
    if (this.#langFormatType !== LANG_FORMAT_TYPE.nonObj) {
      return `.*"(${entryList.join("|")})"[\\s\\S]*?(,\\n|\\s*(?=\\}))`;
    } else {
      return `.*(${entryList.join("|")}).*?\\n`;
    }
  }

  _getRelativePath(str = "") {
    const rootDir = path.resolve(this.langDir, "../..");
    return path.relative(rootDir, str) || "ROOT DIRECTORY";
  }

  _getScore(str = 0) {
    if (str >= 0.85) return "success";
    if (str >= 0.6) return "puzzle";
    if (str >= 0.4) return "shock";
    return "error";
  }

  _getLangFileName(str = "") {
    return `${str}.${this.#langFileType}`;
  }
}

module.exports = LangCheckRobot;
