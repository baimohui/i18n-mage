import { TEntry, EntryTree, PEntry, TEntryPartType, I18N_SOLUTION, I18nSolution } from "@/types";
import { LANG_FORMAT_TYPE, LANG_ENTRY_SPLIT_SYMBOL } from "@/utils/langKey";
import { escapeRegExp, getIdByStr } from "./stringUtils";
import { getConfig } from "@/utils/config";

export function catchPossibleEntries(fileContent: string, langType: string, entryTree: EntryTree): { name: string; pos: number }[] {
  const primaryClassList = Object.keys(entryTree).filter(i => !!i);
  if (primaryClassList.length === 0) return [];
  const primaryClassReg = new RegExp(
    `${langType === LANG_FORMAT_TYPE.nonObj ? "(?<![a-zA-Z0-9\\-]+)" : "(?<=[\"`']{1})"}(${primaryClassList.join("|")})[\\w.]*(?![:=/]{1})`,
    "g"
  );
  let primaryClassRes: RegExpExecArray | null = null;
  const entryInfoList: PEntry[] = [];
  while ((primaryClassRes = primaryClassReg.exec(fileContent)) !== null) {
    const startPos = primaryClassRes.index;
    const entryName = primaryClassRes[0];
    const entryFormList = entryName.split(LANG_ENTRY_SPLIT_SYMBOL[langType] as string);
    let curItem = "";
    let curTree = entryTree;
    let isValid = false;
    let isUndefined = false;
    const entryFormLen = entryFormList.length;
    for (let i = 0; i < entryFormLen; i++) {
      curItem = entryFormList[i];
      if (Object.hasOwn(curTree, curItem)) {
        if (curTree[curItem] === null) {
          isValid = true;
        } else {
          curTree = curTree[curItem] as EntryTree;
        }
      } else {
        isUndefined = i + 1 === entryFormLen;
        break;
      }
    }
    if (isValid) {
      entryInfoList.push({ name: entryName, pos: startPos });
    } else {
      let matchItems: any[] = [];
      const entryPrefixList = entryFormList.slice(0, -1);
      if (isUndefined) {
        matchItems = Object.keys(curTree).filter(item => curTree[item] === null && RegExp(`^${curItem}\\d*$`).test(item));
      } else if (curTree !== entryTree && langType === LANG_FORMAT_TYPE.nonObj) {
        entryPrefixList.push(curItem);
        matchItems = catchPossibleEntries(fileContent, langType, curTree);
      } else {
        entryInfoList.push({ name: entryName, pos: startPos });
      }
      matchItems.forEach(item => {
        entryInfoList.push({ name: [...entryPrefixList, item].join(LANG_ENTRY_SPLIT_SYMBOL[langType] as string), pos: startPos });
      });
    }
  }
  return entryInfoList;
}

export function catchTEntries(fileContent: string): TEntry[] {
  let tFuncNames = getConfig<string[]>("translationFunctionNames", ["t"]);
  const i18nSolution = getConfig<I18nSolution>("i18nSolution");
  if (!tFuncNames.length) tFuncNames = ["t"];
  if (i18nSolution === I18N_SOLUTION.vueI18n) {
    tFuncNames.push("t", "tc");
  }
  const funcNamePattern = tFuncNames.map(fn => `\\b${fn}\\b`).join("|");
  const tReg = new RegExp(`(?<=[$\\s.[({:=]{1})(${funcNamePattern})\\s*\\(\\s*(\\S)`, "g");
  const entryInfoList: TEntry[] = [];
  let tRes: RegExpExecArray | null;
  while ((tRes = tReg.exec(fileContent)) !== null) {
    const startPos = tRes.index - 1; // 起始位
    const offset = tRes[0].length; // 起始位离 t 函数内首个有效字符的距离
    const entry = parseTEntry(fileContent, startPos, offset);
    if (entry) {
      entryInfoList.push(entry);
    }
  }
  return entryInfoList;
}

export function parseTEntry(fileContent: string, startPos: number, offset: number): TEntry | null {
  let isValid = true;
  let curPos = startPos + offset;
  let symbolStr = fileContent[curPos];
  const entryNameForm: { type: TEntryPartType; value: string }[] = [];
  const entryVarList: string[] = [];
  const initSymbolStr = symbolStr;
  let isEntryNameParsed = false;
  let isApart = false;
  while (symbolStr !== ")") {
    if (/[\s+,]/.test(symbolStr)) {
      if (symbolStr === ",") {
        isApart = true;
        isEntryNameParsed = true;
      }
      curPos++;
      symbolStr = fileContent[curPos];
      continue;
    }
    const matchResult = matchTEntryPart(fileContent, curPos, symbolStr);
    if (!matchResult) {
      isValid = false;
      break;
    }
    const { type, value } = matchResult;
    const tPart = { type, value: /["'`]/.test(value) ? value.slice(1, -1) : value };
    if (isEntryNameParsed) {
      if (isApart) {
        entryVarList.push(value);
        isApart = false;
      } else {
        const item = entryVarList.pop();
        entryVarList.push(item + value);
      }
    } else {
      entryNameForm.push(tPart);
    }
    curPos += value.length;
    symbolStr = fileContent[curPos];
  }
  if (!isValid || entryNameForm.every(item => !["text", "varText"].includes(item.type))) {
    return null;
  }
  const entryRaw = fileContent.slice(startPos, curPos + 1);
  isValid = isValid && isStringInUncommentedRange(fileContent, entryRaw);
  const nameInfo = getEntryNameInfoByForm(entryNameForm);
  if (!isValid || !nameInfo) return null;
  return {
    raw: entryRaw,
    vars: entryVarList,
    nameInfo,
    pos: startPos + (entryRaw.indexOf(initSymbolStr) + 1)
  };
}

export function getEntryNameInfoByForm(nameForm: { type: TEntryPartType; value: string }[]) {
  let entryIndex = 0;
  let entryText = "";
  const varList: string[] = [];
  let entryReg = "";
  let tRes: RegExpExecArray | null = null;
  let tempReg: RegExp | null = null;
  let tempStr = "";
  let isValid = true;
  // const tempList: string[] = [];
  nameForm.forEach(item => {
    switch (item.type) {
      case "text":
        entryText += item.value;
        entryReg += escapeRegExp(item.value.replace(/\s/g, ""));
        break;
      case "varText":
        tempStr = item.value;
        tempReg = /\${\s*([^]*?)\s*}/g;
        while ((tRes = tempReg.exec(item.value)) !== null) {
          tempStr = tempStr.replace(tRes[0], `{${entryIndex++}}`);
          varList.push(tRes[1]);
        }
        entryText += tempStr;
        entryReg = escapeRegExp(entryText.replace(/\s/g, "")).replace(/\\\{.*?\\\}/g, ".*");
        isValid = isValid && entryText.replace(/\{\w*?\}/g, "") !== "";
        break;
      case "var":
        entryText += `{${entryIndex++}}`;
        varList.push(item.value);
        entryReg += ".*";
        break;
      case "obj":
        // tempList = [];
        // tempReg = /{(\w*?)}/g;
        // while ((tRes = tempReg.exec(entryText)) !== null) {
        //   tempList.push(tRes[1]);
        // }
        // entryVar = extractKeyValuePairs(item.value);
        isValid = false;
        break;
    }
  });
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
  if (!isValid) return null;
  return {
    text: entryText,
    regex: new RegExp(`^${entryReg}$`),
    vars: varList,
    name: varList.length ? entryText : "",
    id: getIdByStr(entryText),
    boundName: entryName,
    boundClass: entryClass
  };
}

export function extractKeyValuePairs(objStr: string) {
  const result = {};
  const trimmed = objStr.trim();

  // 去除前后的大括号
  const content = trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1) : trimmed;

  let current = "";
  let key = "";
  const braceStack: string[] = [];
  let inString = false;
  let stringChar = "";
  let isParsingKey = true;

  const commit = () => {
    if (key.trim()) {
      result[key.trim()] = current.trim();
    }
    key = "";
    current = "";
    isParsingKey = true;
  };

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = content[i - 1];

    if (inString) {
      if (char === stringChar && prevChar !== "\\") {
        inString = false;
      }
    } else {
      if (char === '"' || char === "'") {
        inString = true;
        stringChar = char;
      } else if (char === "{" || char === "[" || char === "(") {
        braceStack.push(char);
      } else if (char === "}" || char === "]" || char === ")") {
        braceStack.pop();
      } else if (char === ":" && isParsingKey && braceStack.length === 0) {
        isParsingKey = false;
        continue;
      } else if (char === "," && braceStack.length === 0) {
        commit();
        continue;
      }
    }

    if (isParsingKey) {
      key += char;
    } else {
      current += char;
    }
  }

  if (key) commit();
  return result;
}
export function matchTEntryPart(fileContent: string, startPos: number, symbolStr: string): { type: TEntryPartType; value: string } | null {
  let match: RegExpMatchArray | [number, string] | null = null;
  let type: TEntryPartType = "";
  if (/["'`]/.test(symbolStr)) {
    type = symbolStr === "`" ? "varText" : "text";
    match = fileContent.slice(startPos).match(new RegExp(`(${symbolStr}[^]*?(?<!\\\\)${symbolStr})`));
  } else if (symbolStr === "{") {
    type = "obj";
    match = matchBrackets(fileContent, startPos, "{", "}");
  } else if (symbolStr === "[") {
    type = "arr";
    match = matchBrackets(fileContent, startPos, "[", "]");
  } else if (symbolStr) {
    type = "var";
    if (symbolStr === "(") {
      match = matchBrackets(fileContent, startPos, "(", ")");
    } else {
      match = fileContent.slice(startPos).match(new RegExp(`(${escapeRegExp(symbolStr)}[^"'\`{}[\\]\\s,(]*)`));
    }
  }
  if (match) {
    return { type, value: match[1] };
  }
  return null;
}

export function matchBrackets(str: string, startPos = 0, open = "{", close = "}"): [number, string] | null {
  const stack: string[] = [];
  let start = -1;
  for (let i = startPos; i < str.length; i++) {
    const char = str[i];
    if (char === open) {
      if (stack.length === 0) start = i;
      stack.push(char);
    } else if (char === close) {
      stack.pop();
      if (stack.length === 0) {
        return [i, str.slice(start, i + 1)];
      }
    }
  }
  return null;
}

export function isStringInUncommentedRange(code: string, searchString: string): boolean {
  const uncommentedCode = code
    .replace(/lc-disable([^]*?)(lc-enable|$)/g, "")
    .replace(/\/\*[^]*?\*\/|(?<!:\s*)\/\/[^\n]*|<!--[^]*?-->/g, "");
  return uncommentedCode.includes(searchString);
}
