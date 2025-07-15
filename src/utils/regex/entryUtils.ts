import { TEntry, EntryTree, PEntry, TEntryPartType, I18N_FRAMEWORK, I18N_FRAMEWORK_DEFAULT_CONFIG, I18nFeaturesInfo } from "@/types";
import { escapeRegExp, getIdByStr } from "./stringUtils";
import { getValueByAmbiguousEntryName } from "./treeUtils";

export function catchPossibleEntries(
  fileContent: string,
  entryTree: EntryTree,
  i18nFeatures: I18nFeaturesInfo
): { name: string; pos: [number, number] }[] {
  const regex = /(["'`])(?:\\[\s\S]|(?!\1)[^\\])*?\1/g;
  let res: RegExpExecArray | null = null;
  const entryInfoList: PEntry[] = [];
  while ((res = regex.exec(fileContent)) !== null) {
    const entryName = displayToInternalName(res[0].slice(1, -1), i18nFeatures);
    if (!isValidI18nVarName(entryName) || getValueByAmbiguousEntryName(entryTree, entryName) === undefined) continue;
    const startPos = res.index;
    const endPos = startPos + res[0].length;
    entryInfoList.push({ name: entryName, pos: [startPos, endPos] });
  }
  return entryInfoList;
}

export function catchTEntries(fileContent: string, i18nFeatures: I18nFeaturesInfo): TEntry[] {
  let tFuncNames = i18nFeatures.tFuncNames.slice();
  if (!tFuncNames.length) tFuncNames = ["t"];
  if (i18nFeatures.framework === I18N_FRAMEWORK.vueI18n) {
    tFuncNames.push("t", "tc");
  }
  const funcNamePattern = tFuncNames.map(fn => `\\b${fn}\\b`).join("|");
  const tReg = new RegExp(`(?<=[$\\s.[({:=]{1})(${funcNamePattern})\\s*\\(\\s*(\\S)`, "g");
  const entryInfoList: TEntry[] = [];
  let tRes: RegExpExecArray | null;
  while ((tRes = tReg.exec(fileContent)) !== null) {
    const startPos = tRes.index - 1; // 起始位
    const offset = tRes[0].length; // 起始位离 t 函数内首个有效字符的距离
    const entry = parseTEntry(fileContent, startPos, offset, i18nFeatures);
    if (entry) {
      entryInfoList.push(entry);
    }
  }
  return entryInfoList;
}

export function parseTEntry(fileContent: string, startPos: number, offset: number, i18nFeatures: I18nFeaturesInfo): TEntry | null {
  let curPos = startPos + offset;
  const nameStartPos = curPos;
  let nameEndPos = curPos;
  let symbolStr = fileContent[curPos];
  const entryNameForm: { type: TEntryPartType; value: string }[] = [];
  const entryVarList: string[] = [];
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
    if (!matchResult) return null;
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
      nameEndPos = curPos + value.length;
    }
    curPos += value.length;
    symbolStr = fileContent[curPos];
  }
  if (entryNameForm.every(item => !["text", "varText"].includes(item.type))) return null;
  if (entryNameForm.some(item => item.type === "logic")) return null;
  const entryRaw = fileContent.slice(startPos, curPos + 1);
  if (!isStringInUncommentedRange(fileContent, entryRaw)) return null;
  const nameInfo = getEntryNameInfoByForm(entryNameForm, i18nFeatures);
  if (!nameInfo) return null;
  return {
    raw: entryRaw,
    vars: entryVarList,
    nameInfo,
    pos: [nameStartPos, nameEndPos]
  };
}

export function getEntryNameInfoByForm(nameForm: { type: TEntryPartType; value: string }[], i18nFeatures: I18nFeaturesInfo) {
  let entryIndex = 0;
  let entryText = "";
  const varList: string[] = [];
  let entryReg = "";
  let tRes: RegExpExecArray | null = null;
  let tempReg: RegExp | null = null;
  let tempStr = "";
  let isValid = true;
  // const tempList: string[] = [];
  let varPrefix = "{";
  let varSuffix = "}";
  const { interpolationBrackets, framework, defaultNamespace, namespaceSeparator } = i18nFeatures;
  const useDoubleBrackets =
    interpolationBrackets === "double" ||
    (interpolationBrackets === "auto" && framework !== I18N_FRAMEWORK.none && !I18N_FRAMEWORK_DEFAULT_CONFIG[framework].singleBrackets);
  if (useDoubleBrackets) {
    varPrefix = "{{";
    varSuffix = "}}";
  }
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
          tempStr = tempStr.replace(tRes[0], `${varPrefix}${entryIndex++}${varSuffix}`);
          varList.push(tRes[1]);
        }
        entryText += tempStr;
        entryReg = escapeRegExp(entryText.replace(/\s/g, "")).replace(
          new RegExp(`${escapeRegExp(escapeRegExp(varPrefix))}.*?${escapeRegExp(escapeRegExp(varSuffix))}`, "g"),
          ".*"
        );
        isValid = isValid && entryText.replace(new RegExp(`${escapeRegExp(varPrefix)}\\w*?${escapeRegExp(varSuffix)}`, "g"), "") !== "";
        // entryReg = escapeRegExp(entryText.replace(/\s/g, "")).replace(/\\\{.*?\\\}/g, ".*");
        // isValid = isValid && entryText.replace(/\{\w*?\}/g, "") !== "";
        break;
      case "var":
        entryText += `${varPrefix}${entryIndex++}${varSuffix}`;
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
  if (framework === I18N_FRAMEWORK.i18nNext || framework === I18N_FRAMEWORK.reactI18next) {
    if (namespaceSeparator === ".") {
      if (defaultNamespace) {
        entryReg = entryReg.includes(".") ? `(${defaultNamespace}\\.)?${entryReg}` : `${defaultNamespace}\\.${entryReg}`;
      }
    } else {
      entryReg = entryReg.includes(":") ? entryReg.replace(":", "\\.") : defaultNamespace ? `${defaultNamespace}\\.${entryReg}` : entryReg;
    }
  }
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
  } else if (/[?:&|]/.test(symbolStr)) {
    type = "logic";
    match = [0, symbolStr];
  } else if (symbolStr) {
    type = "var";
    if (symbolStr === "(") {
      match = matchBrackets(fileContent, startPos, "(", ")");
    } else {
      match = fileContent.slice(startPos).match(new RegExp(`(${escapeRegExp(symbolStr)}[^"'\`{}[\\]\\s,?:&|()]*)`));
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

// TODO searchString 应替换为具体的方位
export function isStringInUncommentedRange(code: string, searchString: string): boolean {
  const uncommentedCode = code
    .replace(/i18n-mage-disable([^]*?)(i18n-mage-enable|$)/g, "")
    .replace(/\/\*[^]*?\*\/|(?<!:\s*)\/\/[^\n]*|<!--[^]*?-->/g, "");
  return uncommentedCode.includes(searchString);
}

export function displayToInternalName(name: string, i18nFeatures: I18nFeaturesInfo) {
  const { framework, defaultNamespace, namespaceSeparator } = i18nFeatures;
  if (framework === I18N_FRAMEWORK.i18nNext || framework === I18N_FRAMEWORK.reactI18next) {
    if (namespaceSeparator === ".") {
      return name.startsWith(`${defaultNamespace}.`) ? name : `${defaultNamespace}.${name}`;
    } else {
      return name.includes(":") ? name.replace(":", ".") : `${defaultNamespace}.${name}`;
    }
  }
  return name;
}

export function internalToDisplayName(name: string, i18nFeatures: I18nFeaturesInfo) {
  const { framework, namespaceSeparator } = i18nFeatures;
  if (framework === I18N_FRAMEWORK.i18nNext || framework === I18N_FRAMEWORK.reactI18next) {
    if (namespaceSeparator !== ".") {
      return name.replace(".", ":");
    }
  }
  return name;
}

export function isValidI18nVarName(name: string) {
  const validI18nVarNameRegex = /^[a-zA-Z_-][a-zA-Z0-9.:_-]*$/;
  return validI18nVarNameRegex.test(name);
}
