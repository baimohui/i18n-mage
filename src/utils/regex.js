const { LANG_FORMAT_TYPE, LANG_ENTRY_SPLIT_SYMBOL, getLangCode } = require("./const");
const { hasOwn } = require("./common");

const newlineCharacter = "\r\n";

/**
 * 获取字符串的命名类型
 * @param {string} str - 输入字符串
 * @returns {string} 命名类型
 */
const getCaseType = str => {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(str)) return "wc"; // weird-case
  if (str === str.toUpperCase()) return "au"; // Uppercase
  if (/^[a-z][A-Za-z0-9]*$/.test(str)) return "cc"; // camelCase
  if (/^[A-Z][A-Za-z0-9]*$/.test(str)) return "pc"; // PascalCase
  return "unknown";
};

/**
 * 转义正则表达式中的特殊字符
 * @param {string} str - 输入字符串
 * @returns {string} 转义后的字符串
 */
const escapeRegExp = str => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getLangFileInfo = str => {
  try {
    let formatType = "";
    if ([/\w+\s*\(.*\)\s*{[^]*}/, /\s*=>\s*/].every(reg => !reg.test(str))) {
      if (str.includes("export default")) {
        formatType = /\n\s*"?\w+"?\s*:\s*{/.test(str) ? LANG_FORMAT_TYPE.nestedObj : LANG_FORMAT_TYPE.obj;
      }
      if (/\n[\w.]+\s*=\s*".*";+\s/.test(str)) {
        formatType = LANG_FORMAT_TYPE.nonObj;
      }
    }
    if (formatType === "") return null;
    const indents = formatType === LANG_FORMAT_TYPE.nonObj ? "" : str.match(/{\s*\n(\s*)\S/)[1];
    let content = {};
    let langObj = {};
    let prefix = "";
    let suffix = "";
    let innerVar = "";
    if (formatType === LANG_FORMAT_TYPE.nonObj) {
      str = str
        .replace(/\/\*[^]*?\*\/|(?<=["'`;\n]{1}\s*)\/\/[^\n]*|<!--[^]*?-->/g, "")
        .replace(/(\S+)(\s*=\s*)([^]+?);*\s*(?=\n\s*\S+\s*=|$)/g, '"$1":$3,');
      langObj = eval(`({${str}})`);
    } else {
      const match = str.match(/([^]*?)({[^]*})([^]*)/);
      prefix = match[1];
      suffix = match[3];
      str = match[2];
      const spreadVarMatch = str.match(/\n\s*\.\.\.\S+/g);
      if (spreadVarMatch) {
        innerVar = spreadVarMatch.join("");
        const spreadVarReg = new RegExp(`${spreadVarMatch.join("|")}`, "g");
        str = str.replace(spreadVarReg, "");
      }
      langObj = eval(`(${str})`);
    }
    if (getNestedValues(langObj).some(item => typeof item !== "string")) return null;
    // content = formatType === LANG_FORMAT_TYPE.obj ? langObj : flattenNestedObj(langObj);
    content = flattenNestedObj(langObj);
    return {
      formatType,
      indents,
      content,
      raw: langObj,
      prefix,
      suffix,
      innerVar
    };
  } catch (e) {
    return null;
  }
};

const getNestedValues = obj => {
  let values = [];
  for (let key in obj) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      values = values.concat(getNestedValues(obj[key]));
    } else {
      values.push(obj[key]);
    }
  }
  return values;
};

const flattenNestedObj = (obj, res = {}, className = "") => {
  for (const key in obj) {
    if (key.trim() === "") break;
    const value = obj[key];
    const keyName = className ? `${className}.${escapeEntryName(key)}` : escapeEntryName(key);
    if (typeof obj[key] === "object") {
      flattenNestedObj(value, res, keyName);
    } else {
      res[keyName] = value;
    }
  }
  return res;
};

const validateLang = (str, lang) => {
  let res = true;
  const code = getLangCode(lang, "google");
  switch (code) {
    case "zh-CN":
      res = /[\u4E00-\u9FA5\uF900-\uFA2D]+/.test(str);
      break;
    case "ru":
      res = /[а-яА-ЯЁё]/.test(str);
      break;
    case "ja":
      res = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(str);
      break;
    case "en":
      res = /^[a-zA-Z0-9!@#$%^&*()_+-=,.<>/?;:'"[\]{}|\\`~\s]*$/.test(str);
      break;
    case "ar":
      res = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str);
      break;
    case "th":
      res = /[\u0E00-\u0E7F]/.test(str);
      break;
  }
  return res;
};

/**
 * 根据字符串生成唯一 ID
 * @param {string} str - 输入字符串
 * @param {boolean} [usedForEntryName=false] - 是否用于条目名称
 * @returns {string} 生成的 ID
 */
const getIdByStr = (str, usedForEntryName = false) => {
  let id = str.toLowerCase();
  if (usedForEntryName) {
    id = id
      .split("")
      .filter(item => /[a-zA-Z0-9\s-]/.test(item))
      .join("");
    id = id.replace(/[\s-](\S)/g, (_, char) => char.toUpperCase()).replace(/-/g, "");
  }
  id = id.replace(/\s/g, "");
  return id;
};

/**
 * 创建单个条目行
 * @param {Object} params - 参数对象
 * @param {string} params.name - 条目名称
 * @param {string} params.value - 条目值
 * @param {string} params.indents - 缩进
 * @param {string} params.langType - 语言类型
 * @returns {string} 条目行
 */
const createSingleEntryLine = ({ name, value, indents, langType }) => {
  if (typeof value !== "string") {
    throw new Error(`Value is not a string: ${name}, ${value}`);
  }
  const formattedValue = formatEntryValue(value);
  return langType === LANG_FORMAT_TYPE.nonObj ? `${indents}${name} = "${formattedValue}";` : `${indents}"${name}": "${formattedValue}",`;
};

const createSingleEntryObj = ({ name, value, indents, langType }) => {
  let blockContent = "";
  const isNested = Array.isArray(value);
  if (isNested) {
    value.forEach(item => {
      blockContent +=
        createSingleEntryLine({ name: item.name, value: item.value, indents: indents.repeat(2), langType }) + newlineCharacter;
    });
    blockContent = `${indents}"${name}": {${newlineCharacter}${blockContent}${indents}},`;
  } else {
    blockContent += createSingleEntryLine({ name, value, indents, langType });
  }
  return blockContent;
};

/**
 * 替换所有条目
 * @param {Object} params - 参数对象
 * @param {Array} params.data - 数据块数组，每个块包含描述和值
 * @param {string} params.langType - 语言文件的格式类型
 * @param {string} [params.indents="  "] - 缩进字符串
 * @param {Object} [params.extraInfo={}] - 附加信息，包括前缀、后缀等
 * @returns {string} 生成的语言文件内容
 */
const replaceAllEntries = ({ data, langType, indents = "  ", extraInfo = { prefix: "", innerVar: "", suffix: "" } }) => {
  let pageContent = "";
  const blockNum = data.length;
  // 处理嵌套对象格式
  if (langType === LANG_FORMAT_TYPE.nestedObj) {
    const list = [];
    for (let i = 0; i < blockNum; i++) {
      const subObj = {};
      data[i].value.forEach(item => {
        const [className, id] = item.name.split(LANG_ENTRY_SPLIT_SYMBOL[langType]);
        if (id) {
          subObj[className] ??= [];
          subObj[className].push({ name: id, value: item.value });
        } else {
          subObj[className] = item.value;
        }
      });
      const subList = Object.keys(subObj).map(key => ({ name: key, value: subObj[key] }));
      list.push({ desc: data[i].desc, value: subList });
    }
    data = list;
  }
  // 遍历每个数据块
  for (let blockIndex = 0; blockIndex < blockNum; blockIndex++) {
    let { desc, value = [] } = data[blockIndex];
    let blockContent = "";
    const isLastBlock = blockIndex === blockNum - 1;
    const itemNum = value.length;
    // 遍历每个条目
    value.forEach((item, itemIndex) => {
      if (langType === LANG_FORMAT_TYPE.nestedObj) {
        blockContent += createSingleEntryObj({ ...item, langType, indents });
      } else {
        blockContent += createSingleEntryLine({ ...item, langType, indents });
      }
      if (!isLastBlock || itemIndex !== itemNum - 1) {
        blockContent += newlineCharacter;
      }
    });
    // 添加描述块
    if (desc) {
      blockContent = `${indents}// ${desc}${newlineCharacter}${blockContent}`;
      if (!isLastBlock) {
        blockContent += newlineCharacter;
      }
    }
    pageContent += blockContent;
  }
  // 添加前缀和后缀
  if (langType !== LANG_FORMAT_TYPE.nonObj) {
    pageContent = `${extraInfo.prefix}{${extraInfo.innerVar}${newlineCharacter}${pageContent}${newlineCharacter}}${extraInfo.suffix}`;
  }
  return pageContent;
};

/**
 * 添加条目
 * @param {Object} params - 参数对象
 * @param {Array} params.data - 条目数据
 * @param {string} params.raw - 原始内容
 * @param {string} params.langType - 语言类型
 * @param {string} [params.indents=""] - 缩进
 * @param {number} [params.skipLineNum=0] - 跳过的行数
 * @returns {string} 更新后的内容
 */
const addEntries = ({ data, raw, langType, indents = "", skipLineNum = 0 }) => {
  let content = raw;
  let startPos = 0;

  if (langType === LANG_FORMAT_TYPE.nestedObj) {
    const obj = {};
    const list = [];
    data.forEach(item => {
      const [className, id] = item.name.split(LANG_ENTRY_SPLIT_SYMBOL[langType]);
      if (id) {
        obj[className] ??= [];
        obj[className].push({ name: id, value: item.value });
      } else {
        list.push({ name: className, value: item.value });
      }
    });

    // 添加无分类条目
    const noClassEntryContent = list
      .map(item => createSingleEntryLine({ name: item.name, value: item.value, langType, indents }) + newlineCharacter)
      .join("");
    const match = content.match(/{([^]*?)\n/);
    if (match) {
      startPos = match.index + match[0].length;
      content = content.slice(0, startPos) + noClassEntryContent + content.slice(startPos);
    }

    // 添加分类条目
    for (const key in obj) {
      let itemContent = obj[key]
        .map(item => createSingleEntryLine({ name: item.name, value: item.value, langType, indents: indents.repeat(2) }) + newlineCharacter)
        .join("");
      const keyMatch = content.match(new RegExp(`(${key}["'\`]?\\s*:\\s*{[^]*?)\\n`));
      if (keyMatch) {
        startPos = keyMatch.index + keyMatch[0].length;
        content = content.slice(0, startPos) + itemContent + content.slice(startPos);
      } else {
        itemContent = `${indents}"${key}": {${newlineCharacter}${itemContent}${indents}},${newlineCharacter}`;
        const match = content.match(/{([^]*?)\n/);
        if (match) {
          startPos = match.index + match[0].length;
          content = content.slice(0, startPos) + itemContent + content.slice(startPos);
        }
      }
    }
  } else {
    const entryContent = data
      .map(item => createSingleEntryLine({ name: item.name, value: item.value, langType, indents }) + newlineCharacter)
      .join("");
    if (langType === LANG_FORMAT_TYPE.obj) {
      const insertPosReg = new RegExp(`{(${"[^]*?\\n".repeat(skipLineNum + 1)})`);
      const match = raw.match(insertPosReg);
      if (match) {
        startPos = match.index + match[0].length;
      }
    }
    content = raw.slice(0, startPos) + entryContent + raw.slice(startPos);
  }

  return content;
};

const deleteEntries = ({ data, raw }) => {
  const entryLineReg = new RegExp(`(^|\\n)\\s*["'\`]?(${data.join("|")})(?!\\w)[^\\n]*`, "g");
  return raw.replace(entryLineReg, "");
};

/**
 * 格式化条目值
 * @param {string} str - 输入字符串
 * @returns {string} 格式化后的字符串
 */
const formatEntryValue = str => {
  return str
    .replace(/\\(["'`])/g, "$1")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/"/g, '\\"');
};

const catchAllEntries = (fileContent, langType, entryTree) => {
  let tItems = [];
  if (langType === LANG_FORMAT_TYPE.nonObj) {
    tItems = catchCustomTEntries(fileContent);
  } else {
    tItems = catchTEntries(fileContent);
  }
  const existedItems = catchPossibleEntries(fileContent, langType, entryTree);
  return { tItems, existedItems };
};

const catchPossibleEntries = (fileContent, langType, entryTree) => {
  const primaryClassList = Object.keys(entryTree).filter(entry => !!entry);
  if (primaryClassList.length === 0) return [];
  const primaryClassReg = new RegExp(
    `${langType === LANG_FORMAT_TYPE.nonObj ? "(?<![a-zA-Z0-9\\-]+)" : "(?<=[\"`']{1})"}(${primaryClassList.join("|")})[\\w.]*(?![:=/]{1})`,
    "g"
  );
  let primaryClassRes = undefined;
  const entryInfoList = [];
  while ((primaryClassRes = primaryClassReg.exec(fileContent)) !== null) {
    const startPos = primaryClassRes.index;
    const entryName = primaryClassRes[0];
    const entryFormList = entryName.split(LANG_ENTRY_SPLIT_SYMBOL[langType]);
    let curItem = "";
    let curTree = entryTree;
    let isValid = false;
    let isUndefined = false;
    const entryFormLen = entryFormList.length;
    for (let i = 0; i < entryFormLen; i++) {
      curItem = entryFormList[i];
      if (hasOwn(curTree, curItem)) {
        if (curTree[curItem] === null) {
          isValid = true;
        } else {
          curTree = curTree[curItem];
        }
      } else {
        isUndefined = i + 1 === entryFormLen;
        break;
      }
    }
    if (isValid) {
      entryInfoList.push({ name: entryName, pos: startPos });
    } else {
      let matchItems = [];
      const entryPrefixList = entryFormList.slice(0, -1);
      if (isUndefined) {
        // matchItems = Object.keys(curTree).filter(item => curTree[item] === null && item.startsWith(curItem));
        matchItems = Object.keys(curTree).filter(item => curTree[item] === null && RegExp(`^${curItem}\\d*$`).test(item));
      } else if (curTree !== entryTree && langType === LANG_FORMAT_TYPE.nonObj) {
        entryPrefixList.push(curItem);
        matchItems = catchPossibleEntries(fileContent, langType, curTree);
      } else {
        entryInfoList.push({ name: entryName, pos: startPos });
      }
      matchItems.forEach(item => {
        entryInfoList.push({ name: [...entryPrefixList, item].join(LANG_ENTRY_SPLIT_SYMBOL[langType]), pos: startPos });
      });
    }
  }
  return entryInfoList;
};

/**
 * 捕获文件内容中的 t() 函数调用条目
 * @param {string} fileContent - 文件内容
 * @returns {Array} 提取的条目信息列表
 */
const catchTEntries = fileContent => {
  const tReg = /(?<=[$\s.[({:=]{1})t\s*\(\s*(\S)/g;
  const entryInfoList = [];
  let tRes;
  while ((tRes = tReg.exec(fileContent)) !== null) {
    const tStartPos = tRes.index - 1;
    const tCurPos = tStartPos + tRes[0].length;
    const symbolStr = tRes[1];
    const entry = parseTEntry(fileContent, tStartPos, tCurPos, symbolStr);
    if (entry && entry.isValid) {
      entryInfoList.push(entry);
    }
  }
  return entryInfoList;
};

/**
 * 解析单个 t() 函数调用
 * @param {string} fileContent - 文件内容
 * @param {number} startPos - 起始位置
 * @param {string} symbolStr - 当前符号
 * @returns {Object|null} 解析的条目信息
 */
const parseTEntry = (fileContent, startPos, curPos, symbolStr) => {
  let isValid = true;
  const tFormList = [];
  let entryIndex = 0;
  let entryText = "";
  let entryVar = {};
  let entryReg = "";
  let tRes = undefined;
  let tempReg = undefined;
  let tempHelper = undefined;
  const initSymbolStr = symbolStr;
  while (symbolStr !== ")") {
    const matchResult = matchTEntryPart(fileContent, curPos, symbolStr);
    if (!matchResult) {
      isValid = false;
      break;
    }
    const { type, value, nextSymbol, matchLength } = matchResult;
    tFormList.push({ type, value });
    curPos += matchLength;
    symbolStr = nextSymbol;
  }
  if (!isValid || tFormList.every(item => !["text", "varText"].includes(item.type))) {
    return null;
  }

  // 构建条目信息
  tFormList.forEach(item => {
    switch (item.type) {
      case "text":
        entryText += item.value;
        entryReg += escapeRegExp(item.value.replace(/\s/g, ""));
        break;
      case "varText":
        tempHelper = item.value;
        tempReg = /\${\s*([^]*?)\s*}/g;
        while ((tRes = tempReg.exec(item.value)) !== null) {
          tempHelper = tempHelper.replace(tRes[0], `{t${entryIndex}}`);
          entryVar[`t${entryIndex++}`] = tRes[1];
        }
        entryText += tempHelper;
        entryReg = escapeRegExp(entryText.replace(/\s/g, "")).replace(/\{.*?\}/g, ".*");
        isValid = isValid && entryText.replace(/\{\w*?\}/g, "") !== "";

        break;
      case "var":
        entryText += `{t${entryIndex}}`;
        entryVar[`t${entryIndex++}`] = item.value;
        entryReg += ".*";
        break;
      case "obj":
        tempHelper = [];
        tempReg = /{(\w*?)}/g;
        while ((tRes = tempReg.exec(entryText)) !== null) {
          tempHelper.push(tRes[1]);
        }
        tempReg = new RegExp(`{\\s*${("(" + tempHelper.join("|") + ")\\s*:\\s*([^]*?),?\\s*").repeat(tempHelper.length)}}`, "g");
        while ((tRes = tempReg.exec(item.value)) !== null) {
          let num = 1;
          while (tRes[num]) {
            entryVar[tRes[num]] = tRes[num + 1];
            num = num + 2;
          }
        }
        if (tempHelper.length > 0 && Object.keys(entryVar).length === 0) {
          isValid = false;
        }
        break;
    }
  });

  const entryRaw = fileContent.slice(startPos, curPos + 1);
  let entryClass = "";
  let entryName = "";
  const nameRes = entryText.match(/%(\S*?)%([^]*)/);
  if (nameRes) {
    entryName = nameRes[1];
    entryText = nameRes[2];
  }
  const classRes = entryText.match(/#(\S*?)#([^]*)/);
  if (classRes) {
    entryClass = classRes[1];
    entryText = classRes[2];
  }
  if (Object.keys(entryVar).length === 0) {
    entryReg = `^${entryReg}\\d*$`;
  }
  isValid = isValid && isStringInUncommentedRange(fileContent, entryRaw);
  return {
    raw: entryRaw,
    text: entryText,
    var: entryVar,
    regex: new RegExp(entryReg),
    id: getIdByStr(entryText),
    class: entryClass,
    name: entryName,
    pos: startPos + (entryRaw.indexOf(initSymbolStr) + 1),
    isValid
  };
};

/**
 * 匹配 t() 函数的单个部分
 * @param {string} fileContent - 文件内容
 * @param {number} startPos - 起始位置
 * @param {string} symbolStr - 当前符号
 * @returns {Object|null} 匹配结果
 */
const matchTEntryPart = (fileContent, startPos, symbolStr) => {
  let match;
  let type = "";
  let nextSymbol = "";
  let matchLength = 0;
  if (/["'`]/.test(symbolStr)) {
    type = symbolStr === "`" ? "varText" : "text";
    match = fileContent.slice(startPos).match(new RegExp(`${symbolStr}([^]*?)(?<!\\\\)${symbolStr}[\\s+,]*(\\S)`));
  } else if (/[\w(]/.test(symbolStr)) {
    type = "var";
    if (symbolStr === "(") {
      match = matchBrackets(fileContent, startPos, "(", ")");
    } else {
      match = fileContent.slice(startPos).match(new RegExp(`(${symbolStr}[\\w.]*)[\\s+,]*(\\S)`));
    }
  } else if (symbolStr === "{") {
    type = "obj";
    match = matchBrackets(fileContent, startPos, "{", "}");
  }
  if (match) {
    nextSymbol = match[2];
    matchLength = match[0].length - 1;
    return { type, value: match[1], nextSymbol, matchLength };
  }
  return null;
};

/**
 * 匹配括号内容
 * @param {string} fileContent - 文件内容
 * @param {number} startPos - 起始位置
 * @param {string} open - 开括号
 * @param {string} close - 闭括号
 * @returns {Array|null} 匹配结果
 */
const matchBrackets = (fileContent, startPos, open, close) => {
  const regex = new RegExp(`\\${open}([^]*?)\\${close}[\\s+,]*(\\S)`);
  const match = fileContent.slice(startPos).match(regex);
  if (match) {
    const leftCount = (match[1].match(new RegExp(`\\${open}`, "g")) || []).length;
    const rightCount = (match[1].match(new RegExp(`\\${close}`, "g")) || []).length;
    if (leftCount !== rightCount) {
      return null; // 不匹配的括号
    }
  }
  return match;
};

const catchCustomTEntries = fileContent => {
  const customT = "lc@";
  const tReg = new RegExp(`(["'\`]){1}${customT}`, "g");
  const entryInfoList = [];
  let tRes = undefined;
  while ((tRes = tReg.exec(fileContent)) !== null) {
    const tStartPos = tRes.index;
    const symbolStr = tRes[1];
    let entryText = "";
    let entryName = "";
    let entryClass = "";
    const match = fileContent.slice(tStartPos).match(new RegExp(`${symbolStr}${customT}([^]*?)(?<!\\\\)${symbolStr}`));
    entryText = match[1];
    const nameRes = entryText.match(/%(\S*?)%([^]*)/);
    if (nameRes) {
      entryName = nameRes[1];
      entryText = nameRes[2];
    }
    const classRes = entryText.match(/#(\S*?)#([^]*)/);
    if (classRes) {
      entryClass = classRes[1];
      entryText = classRes[2];
    }
    const entryRegex = escapeRegExp(entryText.replace(/\s/g, ""));
    entryInfoList.push({
      raw: match[0],
      text: entryText,
      regex: new RegExp(entryRegex),
      id: getIdByStr(entryText),
      class: entryClass,
      name: entryName,
      pos: tStartPos
    });
  }
  return entryInfoList;
};

const isStringInUncommentedRange = (code, searchString) => {
  const uncommentedCode = code
    .replace(/lc-disable([^]*?)(lc-enable|$)/g, "")
    .replace(/\/\*[^]*?\*\/|(?<!:\s*)\/\/[^\n]*|<!--[^]*?-->/g, "");
  return uncommentedCode.includes(searchString);
};

const genLangTree = (tree = {}, content = {}, type = "") => {
  for (const key in content) {
    if (typeof content[key] === "object") {
      tree[key] = {};
      genLangTree(tree[key], content[key], type);
    } else {
      tree[key] = type === "string" ? content[key] : content[key].replace(/\s/g, "");
    }
  }
};

const traverseLangTree = (langTree, callback, prefix = "") => {
  for (const key in langTree) {
    if (typeof langTree[key] === "object") {
      traverseLangTree(langTree[key], callback, prefix ? `${prefix}.${key}` : key);
    } else {
      callback(prefix + key, langTree[key]);
    }
  }
};

const getLangObjType = obj => {
  if (typeof obj !== "object") return "";
  return Object.keys(obj).some(key => typeof obj[key] === "object") ? "object" : "string";
};

const getEntryFromLangTree = (langTree, key) => {
  let res = "";
  const blockList = key.split(".");
  for (let i = 0; i < blockList.length; i++) {
    const prefix = blockList.slice(0, i + 1).join(".");
    if (getLangObjType(langTree[prefix]) === "object") {
      res = getEntryFromLangTree(langTree[prefix], blockList.slice(i + 1).join("."));
      if (res) break;
    } else if (getLangObjType(langTree[prefix]) === "string") {
      res = langTree[prefix];
      break;
    }
  }
  return res;
};

const setEntryToLangTree = (langTree, key, value) => {
  let res = false;
  const blockList = key.split(".");
  for (let i = 0; i < blockList.length; i++) {
    const prefix = blockList.slice(0, i + 1).join(".");
    if (getLangObjType(langTree[prefix]) === "object") {
      res = setEntryToLangTree(langTree[prefix], blockList.slice(i + 1).join("."), value);
      if (res) break;
    } else if (getLangObjType(langTree[prefix]) === "string") {
      langTree[prefix] = value;
      res = true;
      break;
    }
  }
  return res;
};

const escapeEntryName = str => {
  return str
    .replace(/\\/g, "\\\\") // 先转义反斜杠（\ -> \\）
    .replace(/\./g, "\\."); // 再转义点（. -> \.）
};

const unescapeEntryName = str => {
  return str
    .replace(/\\\./g, ".") // 先还原点（\. -> .）
    .replace(/\\\\/g, "\\"); // 再还原反斜杠（\\ -> \）
};

const parseEscapedPath = path => {
  const result = [];
  let current = "";
  let escaping = false;

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (escaping) {
      // 处理转义字符
      current += char;
      escaping = false;
    } else if (char === "\\") {
      escaping = true;
    } else if (char === ".") {
      // 遇到点，表示分隔（如果没有被转义）
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (escaping) {
    throw new Error("Invalid escape sequence at end of string");
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result;
};

const getValueByEscapedEntryName = (langTree, escapedPath) => {
  const pathParts = parseEscapedPath(escapedPath);
  let current = langTree;
  for (const part of pathParts) {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
};

function getValueByAmbiguousEntryName(langTree, ambiguousPath) {
  // 输入验证：确保 obj 是对象且不为 null
  if (typeof langTree !== "object" || langTree === null) {
    return undefined;
  }

  // 将字符串按 '.' 分割成数组
  const parts = ambiguousPath.split(".");
  const m = parts.length;

  // 处理空字符串或无 '.' 的情况
  if (m === 0) {
    return undefined;
  }

  // 计算所有可能的分割组合数（2^(m-1)）
  const numCombinations = 1 << (m - 1);

  // 遍历所有可能的分割方式
  for (let i = 0; i < numCombinations; i++) {
    const split = buildSplit(parts, i, m);
    const value = accessPath(langTree, split);
    if (value !== undefined) {
      return value; // 返回第一个找到的有效值
    }
  }

  // 如果没有找到有效值，返回 undefined
  return undefined;
}

// 辅助函数：根据二进制掩码生成分割方式
function buildSplit(parts, i, m) {
  const split = [];
  let current = parts[0]; // 从第一个部分开始

  // 遍历每个 '.' 的位置
  for (let j = 0; j < m - 1; j++) {
    if ((i & (1 << j)) !== 0) {
      // 如果当前位为 1，合并当前部分和下一个部分
      current += "." + parts[j + 1];
    } else {
      // 如果当前位为 0，分隔当前部分，开启新部分
      split.push(current);
      current = parts[j + 1];
    }
  }
  split.push(current); // 添加最后一个部分
  return split;
}

// 辅助函数：按照属性路径访问对象
function accessPath(obj, path) {
  let current = obj;
  for (const key of path) {
    // 检查当前节点是否为对象且包含该属性
    if (current && typeof current === "object" && key in current) {
      current = current[key];
    } else {
      return undefined; // 路径无效，返回 undefined
    }
  }
  return current; // 返回最终值
}

module.exports = {
  getCaseType,
  escapeRegExp,
  getLangFileInfo,
  validateLang,
  getIdByStr,
  replaceAllEntries,
  addEntries,
  deleteEntries,
  catchAllEntries,
  catchTEntries,
  genLangTree,
  traverseLangTree,
  getEntryFromLangTree,
  setEntryToLangTree,
  escapeEntryName,
  unescapeEntryName,
  getValueByEscapedEntryName,
  getValueByAmbiguousEntryName
};
