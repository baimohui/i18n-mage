const { LANG_FORMAT_TYPE, LANG_ENTRY_SPLIT_SYMBOL, getLangCode } = require("./const");
const { hasOwn } = require("./common");

const newlineCharacter = "\r\n";

const getCaseType = str => {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(str)) return "wc"; // weird-case
  if (str === str.toUpperCase()) return "au"; // Uppercase
  if (str.match(/^[a-z][A-Za-z0-9]*$/)) return "cc"; // camelCase
  if (str.match(/^[A-Z][A-Za-z0-9]*$/)) return "pc"; // PascalCase
};

const escapeRegExp = str => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); //$&表示整个被匹配的字符串
};

const getLangFileInfoByRegex = str => {
  let formatType = "";
  if ([/\w+\s*\(.*\)\s*{[^]*}/, /\s*=>\s*/].every(reg => !reg.test(str))) {
    if (str.includes("export default")) {
      formatType = /\s*"\w+"\s*:\s*{/.test(str) ? LANG_FORMAT_TYPE.nestedObj : LANG_FORMAT_TYPE.obj;
    }
    if (/\n[\w.]+\s*=\s*".*";+\s/.test(str)) {
      formatType = LANG_FORMAT_TYPE.nonObj;
    }
  }
  if (formatType === "") return null;
  const indents = formatType === LANG_FORMAT_TYPE.nonObj ? "" : str.match(/{\s*\n(\s*)\S/)[1];
  let nameValueReg = undefined;
  let tempStr = "";
  let tempResult = [];
  const tempReg = /\s*"?(\S+?)"?:\s*({[^]*?}),?\s*/g;
  switch (formatType) {
    case LANG_FORMAT_TYPE.nonObj:
      nameValueReg = /(\S+)\s*=\s*["|']([^\n]+)["|'];?/g;
      break;
    case LANG_FORMAT_TYPE.obj:
      nameValueReg = /\s*"?(\S+?)"?\s*:\s*["'`]{1}([^]*?)["'`]{1}\s*,?\s*(\/\/[^]*?)?\r?\n/g;
      break;
    case LANG_FORMAT_TYPE.nestedObj:
      while ((tempResult = tempReg.exec(str)) !== null) {
        tempStr += tempResult[2].replace(/(\s*")(\w+"\s*:\s*".*")/g, (match, p1, p2) => {
          return p1 + tempResult[1] + "." + p2;
        });
      }
      str = tempStr;
      nameValueReg = /\s*"(\S+?)"\s*:\s*"(.*)"/g;
      break;
  }
  let content = {};
  let regExecResult = [];
  const repeatKeyMap = {};
  while ((regExecResult = nameValueReg.exec(str)) !== null) {
    if (regExecResult[1].trim() === "") continue;
    if (hasOwn(content, regExecResult[1])) {
      repeatKeyMap[regExecResult[1]] = (repeatKeyMap[regExecResult[1]] || [content[regExecResult[1]]]).concat(regExecResult[2]);
    }
    content[regExecResult[1]] = regExecResult[2];
  }
  return {
    formatType,
    indents,
    content,
    repeatKeyMap
  };
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
    content = formatType === LANG_FORMAT_TYPE.obj ? langObj : flattenNestedObj(langObj);
    return {
      formatType,
      indents,
      content,
      prefix,
      suffix,
      innerVar
    };
  } catch (e) {
    return null;
  }
};

const flattenNestedObj = (obj, res = {}, className = "") => {
  for (const key in obj) {
    if (key.trim() === "") break;
    const value = obj[key];
    const keyName = className ? `${className}${LANG_ENTRY_SPLIT_SYMBOL[LANG_FORMAT_TYPE.nestedObj]}${key}` : key;
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

const getIdByStr = (str, usedForEntryName = false) => {
  let id = str.toLowerCase();
  if (usedForEntryName) {
    id = id.split("");
    id = id.filter(item => /[a-zA-Z0-9\s-]{1}/.test(item)).join("");
    id = id.replace(/[\s-]{1}(\S{1})/g, match => match.toUpperCase()).replaceAll("-", "");
  }
  id = id.replace(/\s/g, "");
  return id;
};

const createSingleEntryLine = ({ name, value, indents, langType }) => {
  let res = "";
  if (typeof value !== "string") {
    console.log("value is not a string", name, value);
    return {};
  }
  if (langType === LANG_FORMAT_TYPE.nonObj) {
    res = `${indents}${name} = "${formatEntryValue(value)}";`;
  } else {
    res = `${indents}"${name}": "${formatEntryValue(value)}",`;
  }
  return res;
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

// { data: [ { desc: "块描述", value: [ { name: "条目名", value: "条目值" } ] } ], langType: "obj", indents: "  " }
const replaceAllEntries = ({ data, langType, indents = "  ", extraInfo = { prefix: "", innerVar: "", suffix: "" } }) => {
  let pageContent = "";
  const blockNum = data.length;
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
  for (let blockIndex = 0; blockIndex < blockNum; blockIndex++) {
    let { desc, value = [] } = data[blockIndex];
    let blockContent = "";
    const isLastBlock = blockIndex === blockNum - 1;
    const itemNum = value.length;
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
    if (desc) {
      blockContent = `${indents}// ${desc}${newlineCharacter}${blockContent}`;
      if (!isLastBlock) {
        blockContent += newlineCharacter;
      }
    }
    pageContent += blockContent;
  }
  if (langType !== LANG_FORMAT_TYPE.nonObj) {
    pageContent = `${extraInfo.prefix}{${extraInfo.innerVar}${newlineCharacter}${pageContent}${newlineCharacter}}${extraInfo.suffix}`;
  }
  return pageContent;
};

const addEntries = ({ data, raw, langType, indents = "", skipLineNum = 0 }) => {
  let content = "";
  let match = undefined;
  let startPos = 0;
  if (langType === LANG_FORMAT_TYPE.nestedObj) {
    const obj = {};
    const list = [];
    content = raw;
    data.forEach(item => {
      const [className, id] = item.name.split(LANG_ENTRY_SPLIT_SYMBOL[langType]);
      if (id) {
        obj[className] ??= [];
        obj[className].push({ name: id, value: item.value });
      } else {
        list.push({ name: className, value: item.value });
      }
    });
    const noClassEntryContent = list
      .map(item => createSingleEntryLine({ name: item.name, value: item.value, langType, indents }) + newlineCharacter)
      .join("");
    match = content.match(/{([^]*?)\n/);
    startPos = match.index + match[0].length;
    content = content.slice(0, startPos) + noClassEntryContent + content.slice(startPos);
    for (const key in obj) {
      let itemContent = obj[key]
        .map(item => createSingleEntryLine({ name: item.name, value: item.value, langType, indents: indents.repeat(2) }) + newlineCharacter)
        .join("");
      match = content.match(new RegExp(`(${key}["'\`]?\\s*:\\s*{[^]*?)\\n`));
      if (match) {
        startPos = match.index + match[0].length;
        content = content.slice(0, startPos) + itemContent + content.slice(startPos);
      } else {
        itemContent = `${indents}"${key}": {${newlineCharacter}${itemContent}${indents}},${newlineCharacter}`;
        match = content.match(/{([^]*?)\n/);
        startPos = match.index + match[0].length;
        content = content.slice(0, startPos) + itemContent + content.slice(startPos);
      }
    }
  } else {
    content = data
      .map(item => createSingleEntryLine({ name: item.name, value: item.value, langType, indents }) + newlineCharacter)
      .join("");
    if (langType === LANG_FORMAT_TYPE.obj) {
      const insertPosReg = new RegExp(`{(${"[^]*?\\n".repeat(skipLineNum + 1)})`);
      match = raw.match(insertPosReg);
      startPos = match.index + match[0].length;
    }
    content = raw.slice(0, startPos) + content + raw.slice(startPos);
  }
  return content;
};

const deleteEntries = ({ data, raw }) => {
  const entryLineReg = new RegExp(`(^|\\n)\\s*["'\`]?(${data.join("|")})(?!\\w)[^\\n]*`, "g");
  return raw.replace(entryLineReg, "");
};

const formatEntryValue = str => {
  return str
    .replace(/\\("'`){1}/g, "$1")
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
  // return [...new Set(entryInfoList)];
};

const catchTEntries = fileContent => {
  const tReg = /(?<=[$\s.[({:="']{1})t\s*\(\s*(\S)/g;
  const entryInfoList = [];
  let tRes = undefined;
  let tStartPos = 0;
  while ((tRes = tReg.exec(fileContent)) !== null) {
    tStartPos = tRes.index - 1;
    let tCurPos = tStartPos + tRes[0].length;
    let symbolStr = tRes[1];
    let isValid = true;
    const tFormList = [];
    let match = [];
    let type = "";
    while (symbolStr !== ")") {
      if (/["'`]{1}/.test(symbolStr)) {
        type = symbolStr === "`" ? "varText" : "text";
        match = fileContent.slice(tCurPos).match(new RegExp(`${symbolStr}([^]*?)(?<!\\\\)${symbolStr}[\\s+,]*(\\S)`));
      } else if (/[\w(]{1}/.test(symbolStr)) {
        type = "var";
        if (symbolStr === "(") {
          match = fileContent.slice(tCurPos).match(/(\([^]*?\))\s*(\))/);
          const checkMatchLen = (str, match) => match[1].split("").filter(item => item === str).length;
          let leftBracketLen = checkMatchLen("(", match);
          let rightBracketLen = checkMatchLen(")", match);
          while (leftBracketLen !== rightBracketLen) {
            const bracketReg = new RegExp(`({${"[^]*?\\)".repeat(leftBracketLen)})[\\s+,]*(\\S)`);
            match = fileContent.slice(tCurPos).match(bracketReg);
            leftBracketLen = checkMatchLen("(", match);
            rightBracketLen = checkMatchLen(")", match);
          }
        } else {
          match = fileContent.slice(tCurPos).match(new RegExp(`(${symbolStr}[\\w.]*)[\\s+,]*(\\S)`));
        }
      } else if (symbolStr === "{") {
        type = "obj";
        match = fileContent.slice(tCurPos).match(/({[^]*?})\s*(\))/);
        const checkMatchLen = (str, match) => match[1].split("").filter(item => item === str).length;
        let leftBracketLen = checkMatchLen("{", match);
        let rightBracketLen = checkMatchLen("}", match);
        while (leftBracketLen !== rightBracketLen) {
          const bracketReg = new RegExp(`({${"[^]*?}".repeat(leftBracketLen)})(\\))`);
          match = fileContent.slice(tCurPos).match(bracketReg);
          leftBracketLen = checkMatchLen("{", match);
          rightBracketLen = checkMatchLen("}", match);
        }
      } else {
        isValid = false;
        break;
      }
      tFormList.push({ type, value: match[1] });
      tCurPos += match[0].length - 1;
      symbolStr = match[2];
    }
    let entryIndex = 0;
    let entryText = "";
    let entryVar = {};
    let entryReg = "";
    let tempReg = undefined;
    let tempHelper = undefined;
    isValid = isValid && tFormList.some(item => !["var", "obj"].includes(item.type));
    if (isValid) {
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
              tempHelper = 1;
              while (tRes[tempHelper]) {
                entryVar[tRes[tempHelper]] = tRes[tempHelper + 1];
                tempHelper = tempHelper + 2;
              }
            }
            if (String(tempHelper).length > 0 && Object.keys(entryVar).length === 0) {
              isValid = false;
            }
            break;
        }
      });
    }
    const entryRaw = fileContent.slice(tStartPos, tCurPos + 1);
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
    if (isValid) {
      entryInfoList.push({
        raw: entryRaw,
        text: entryText,
        var: entryVar,
        regex: new RegExp(entryReg),
        id: getIdByStr(entryText),
        class: entryClass,
        name: entryName,
        pos: tStartPos + (tRes ? entryRaw.indexOf(tRes[1]) : 0)
      });
    }
  }
  return entryInfoList;
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

module.exports = {
  getCaseType,
  escapeRegExp,
  getLangFileInfo,
  getLangFileInfoByRegex,
  validateLang,
  getIdByStr,
  replaceAllEntries,
  addEntries,
  deleteEntries,
  catchAllEntries,
  catchTEntries
};
