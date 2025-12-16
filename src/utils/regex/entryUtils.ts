import { TEntry, EntryTree, PEntry, TEntryPartType, I18N_FRAMEWORK, I18N_FRAMEWORK_DEFAULT_CONFIG, I18nFramework } from "@/types";
import { escapeRegExp } from "./stringUtils";
import { getValueByAmbiguousEntryName } from "./treeUtils";
import { getCacheConfig } from "../config";

export function catchLiteralEntries(fileContent: string, entryTree: EntryTree, fileName: string): PEntry[] {
  // 匹配普通字符串，但前面不能是 `t(`、`tc(`、等国际化函数调用
  const tFuncNames = getCacheConfig<string[]>("i18nFeatures.translationFunctionNames", []);
  const framework = getCacheConfig<I18nFramework>("i18nFeatures.framework", I18N_FRAMEWORK.none);
  if (!tFuncNames.length) tFuncNames.push("t");
  if (framework === I18N_FRAMEWORK.vueI18n) {
    ["t", "tc"].forEach(name => {
      if (!tFuncNames.includes(name)) tFuncNames.push(name);
    });
  }
  const funcNamePattern = tFuncNames.map(fn => `\\b${fn}\\b`).join("|");
  const withoutTRegex = new RegExp(`(\\b(?:${funcNamePattern})\\s*\\()(["'\`])((?:\\\\[\\s\\S]|(?!\\2)[^\\\\])*?\\2)`, "g");
  const withoutTContent = fileContent.replace(withoutTRegex, (match, prefix, quote, content: string) => {
    // 计算原字符串内容的长度
    const contentLength = content.length + 1;
    // 创建相同长度的占位符（使用*号）
    const placeholder = "*".repeat(contentLength);
    // 返回相同长度的替换结果
    return `${prefix}${placeholder}`;
  });
  let res: RegExpExecArray | null = null;
  const entryInfoList: PEntry[] = [];
  const regex = /(["'`])(?:\\[\s\S]|(?!\1)[^\\])*?\1/g;
  while ((res = regex.exec(withoutTContent)) !== null) {
    let entryName = displayToInternalName(res[0].slice(1, -1));
    let entryValue = "";
    const framework = getCacheConfig<I18nFramework>("i18nFeatures.framework");
    if (framework === I18N_FRAMEWORK.vscodeL10n && fileName === "package.json") {
      const match = entryName.match(/%(.*?)%(.*)/);
      if (match) {
        entryName = match[1];
        entryValue = match[2];
      }
    }
    if (
      !entryValue &&
      (isPositionInComment(fileContent, res.index) ||
        !isValidI18nVarName(entryName) ||
        getValueByAmbiguousEntryName(entryTree, entryName) === undefined)
    )
      continue;
    const startPos = res.index;
    const endPos = startPos + res[0].length;
    entryInfoList.push({ name: entryName, value: entryValue, pos: `${startPos},${endPos}` });
  }
  return entryInfoList;
}

export function catchTEntries(fileContent: string): TEntry[] {
  const tFuncNames = getCacheConfig<string[]>("i18nFeatures.translationFunctionNames", []);
  const framework = getCacheConfig<I18nFramework>("i18nFeatures.framework", I18N_FRAMEWORK.none);
  if (!tFuncNames.length) tFuncNames.push("t");
  if (framework === I18N_FRAMEWORK.vueI18n) {
    ["t", "tc"].forEach(name => {
      if (!tFuncNames.includes(name)) tFuncNames.push(name);
    });
  }

  const funcNamePattern = tFuncNames.map(fn => `\\b${fn}\\b`).join("|");
  const tReg = new RegExp(`(?<=[$\\s.[({:="']{1})(${funcNamePattern})\\s*\\(\\s*(\\S)`, "g");
  const entryInfoList: TEntry[] = [];

  if (framework === I18N_FRAMEWORK.variableName) {
    const propertyEntries = catchVariableEntries(fileContent, tFuncNames);
    entryInfoList.push(...propertyEntries);
    return entryInfoList;
  }
  // 新增：识别对象属性访问形式 (e.g. I18N.Home.Title) 改成tFunNames 可以按照配置来

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

/** 捕获对象属性访问形式的国际化键  前缀I18N */
export function catchVariableEntries(fileContent: string, rootNames: string[]): TEntry[] {
  const entries: TEntry[] = [];

  /** 匹配对象属性访问形式  前缀I18N */
  const rootPattern = rootNames.map(fn => `\\b${escapeRegExp(fn)}`).join("|");

  /** 正则 匹配对象属性访问形式  前缀I18N */
  const propertyReg = new RegExp(`(?<=[$\\s.[({:="']{1})(${rootPattern})\\.([a-zA-Z0-9_]+(?:\\s*\\.\\s*[a-zA-Z0-9_]+)*)`, "g");

  let match: RegExpExecArray | null;
  while ((match = propertyReg.exec(fileContent)) !== null) {
    const fullMatchDifLength = match[0].length - match[0].replace(/\s+/g, "").length;
    const fullMatch = match[0].replace(/\s+/g, "");
    const keyPath = match[2].replace(/\s+/g, "");
    const startPos = match.index - 1;
    const endPos = match.index + fullMatch.length + 1 + fullMatchDifLength;

    // 检查是否在注释中
    if (isPositionInComment(fileContent, match.index)) continue;

    entries.push({
      raw: fullMatch,
      vars: [], // 属性访问不支持变量插值
      pos: `${startPos},${endPos},${startPos},${endPos}`,
      nameInfo: {
        text: fullMatch,
        regex: new RegExp(`^${escapeRegExp(fullMatch)}$`),
        name: keyPath,
        boundPrefix: "",
        boundKey: "",
        vars: []
      }
    });
  }
  return entries;
}

export function parseTEntry(fileContent: string, startPos: number, offset: number): TEntry | null {
  let curPos = startPos + offset;
  const nameStartPos = curPos;
  let nameEndPos = curPos;
  let symbolStr = fileContent[curPos];
  const entryNameForm: { type: TEntryPartType; value: string }[] = [];
  const entryVarList: string[] = [];
  let isEntryNameParsed = false;
  let isVarSeparated = false;
  let isNameVarSeparated = false;
  let connectorStr = "";
  while (symbolStr !== ")") {
    if (/[\s+,]/.test(symbolStr)) {
      if (symbolStr === ",") {
        isVarSeparated = true;
        isEntryNameParsed = true;
      }
      if (symbolStr === "+") {
        isNameVarSeparated = true;
        if (isEntryNameParsed) {
          connectorStr += symbolStr;
        }
      }
      if (/\s/.test(symbolStr)) {
        connectorStr += symbolStr;
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
      if (isVarSeparated) {
        entryVarList.push(value);
        isVarSeparated = false;
      } else {
        const item = entryVarList.pop();
        entryVarList.push([item, value].join(connectorStr));
      }
    } else {
      if (isNameVarSeparated || entryNameForm.length === 0) {
        entryNameForm.push(tPart);
        isNameVarSeparated = false;
      } else {
        const item = entryNameForm.pop();
        if (item) {
          entryNameForm.push({ type: "var", value: [item.value, value].join(connectorStr) });
        }
      }
      nameEndPos = curPos + value.length;
    }
    connectorStr = "";
    curPos += value.length;
    symbolStr = fileContent[curPos];
  }
  if (entryNameForm.every(item => !["text", "varText"].includes(item.type))) return null;
  if (entryNameForm.some(item => item.type === "logic")) return null;
  const entryRaw = fileContent.slice(startPos, curPos + 1);
  if (isPositionInComment(fileContent, startPos)) return null;
  const nameInfo = getEntryNameInfoByForm(entryNameForm, entryVarList);
  if (!nameInfo) return null;
  return {
    raw: entryRaw,
    vars: entryVarList,
    nameInfo,
    pos: `${nameStartPos},${nameEndPos},${startPos},${curPos + 1}`
  };
}

export function getEntryNameInfoByForm(nameForm: { type: TEntryPartType; value: string }[], entryVarList: string[]) {
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
  const interpolationBrackets = getCacheConfig<"single" | "double" | "auto">("i18nFeatures.interpolationBrackets");
  const framework = getCacheConfig<I18nFramework>("i18nFeatures.framework");
  const defaultNamespace = getCacheConfig<string>("i18nFeatures.defaultNamespace");
  const namespaceSeparator = getCacheConfig<"." | "auto" | ":">("i18nFeatures.namespaceSeparator");
  const enableKeyTagRule = getCacheConfig<boolean>("writeRules.enableKeyTagRule");
  const enablePrefixTagRule = getCacheConfig<boolean>("writeRules.enablePrefixTagRule");
  const useDoubleBrackets =
    interpolationBrackets === "double" ||
    (interpolationBrackets === "auto" &&
      framework &&
      framework !== I18N_FRAMEWORK.auto &&
      framework !== I18N_FRAMEWORK.none &&
      !I18N_FRAMEWORK_DEFAULT_CONFIG[framework].singleBrackets);
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
  if (!isValid || entryReg.replaceAll(".*", "") === "") return null;
  let entryPrefix = "";
  let entryKey = "";
  let remainingText = entryText;
  const nameRes = entryText.match(/^%(\S*?)%([^]*)/);
  if (enableKeyTagRule && nameRes) {
    entryKey = nameRes[1];
    remainingText = nameRes[2];
  }
  const classRes = entryText.match(/^#(\S*?)#([^]*)/);
  if (enablePrefixTagRule && classRes) {
    entryPrefix = classRes[1];
    remainingText = classRes[2];
  }
  if (enableKeyTagRule && !entryKey) {
    const nameResAgain = remainingText.match(/^%(\S*?)%([^]*)/);
    if (nameResAgain) {
      entryKey = nameResAgain[1];
      remainingText = nameResAgain[2];
    }
  }
  entryText = remainingText;
  if (framework === I18N_FRAMEWORK.i18nNext || framework === I18N_FRAMEWORK.reactI18next) {
    if (entryVarList.length === 1) {
      const varItem = extractKeyValuePairs(entryVarList[0]);
      if (varItem === null || Object.hasOwn(varItem, "context")) {
        entryReg += ".*";
      }
    }
    if (namespaceSeparator === ".") {
      if (defaultNamespace) {
        entryReg = entryReg.includes(".") ? `(${defaultNamespace}\\.)?${entryReg}` : `${defaultNamespace}\\.${entryReg}`;
      }
    } else {
      entryReg = entryReg.includes(":") ? entryReg.replace(":", "\\.") : defaultNamespace ? `${defaultNamespace}\\.${entryReg}` : entryReg;
    }
  } else if (framework === I18N_FRAMEWORK.vueI18n) {
    entryReg = entryReg.replace(/\\\[([^\]]+)\\\]/g, "\\.\\d+");
  }
  return {
    text: entryText,
    regex: new RegExp(`^${entryReg}$`),
    vars: varList,
    name: displayToInternalName(entryText),
    boundKey: entryKey,
    boundPrefix: entryPrefix
  };
}

export function extractKeyValuePairs(objStr: string) {
  const result = {};
  const trimmed = objStr.trim();

  // 不是以 { 开头并以 } 结尾的，或中间不包含冒号，直接返回 null
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}") || !trimmed.includes(":")) {
    return null;
  }

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

export function isPositionInComment(code: string, index: number): boolean {
  const ignoreCommentedCode = getCacheConfig<boolean>("analysis.ignoreCommentedCode");
  const commentRanges: [number, number][] = [];
  if (ignoreCommentedCode) {
    // 匹配多行注释
    const blockComments = code.matchAll(/\/\*[\s\S]*?\*\//g);
    for (const match of blockComments) {
      if (match.index !== undefined) {
        commentRanges.push([match.index, match.index + match[0].length]);
      }
    }
    // 匹配单行注释（排除 URL 中的 http://）
    const lineComments = code.matchAll(/(^|[^:])\/\/[^\n]*/g);
    for (const match of lineComments) {
      const start = match.index + (match[1] ? 1 : 0);
      commentRanges.push([start, start + match[0].length - (match[1] ? 1 : 0)]);
    }
    // 匹配 HTML 注释（如 Vue 模板中的注释）
    const htmlComments = code.matchAll(/<!--[\s\S]*?-->/g);
    for (const match of htmlComments) {
      if (match.index !== undefined) {
        commentRanges.push([match.index, match.index + match[0].length]);
      }
    }
  }
  // 匹配 i18n-mage-disable ... i18n-mage-enable 自定义忽略区域
  const disableBlocks = code.matchAll(/i18n-mage-disable[\s\S]*?(i18n-mage-enable|$)/g);
  for (const match of disableBlocks) {
    if (match.index !== undefined) {
      commentRanges.push([match.index, match.index + match[0].length]);
    }
  }
  // 判断 index 是否在任何区间内
  return commentRanges.some(([start, end]) => index >= start && index < end);
}

export function displayToInternalName(name: string) {
  const framework = getCacheConfig<I18nFramework>("i18nFeatures.framework");
  const defaultNamespace = getCacheConfig<string>("i18nFeatures.defaultNamespace");
  const namespaceSeparator = getCacheConfig<"." | "auto" | ":">("i18nFeatures.namespaceSeparator");
  if (framework === I18N_FRAMEWORK.i18nNext || framework === I18N_FRAMEWORK.reactI18next) {
    if (namespaceSeparator === ".") {
      return name.startsWith(`${defaultNamespace}.`) ? name : `${defaultNamespace}.${name}`;
    } else {
      return name.includes(":") ? name.replace(":", ".") : `${defaultNamespace}.${name}`;
    }
  } else if (framework === I18N_FRAMEWORK.vueI18n) {
    return name
      .replace(/\\(['"])/g, "$1")
      .replace(/\[['"]([^'"[\]]+)['"]\]/g, ".$1")
      .replace(/\[(\d+)\]/g, ".$1")
      .replace(/^\./, "");
  }
  return name;
}

export function internalToDisplayName(name: string) {
  const framework = getCacheConfig<I18nFramework>("i18nFeatures.framework");
  const defaultNamespace = getCacheConfig<string>("i18nFeatures.defaultNamespace");
  let namespaceSeparator = getCacheConfig<"." | "auto" | ":">("i18nFeatures.namespaceSeparator");
  if (framework === I18N_FRAMEWORK.i18nNext || framework === I18N_FRAMEWORK.reactI18next) {
    if (namespaceSeparator !== ".") {
      namespaceSeparator = ":";
      name = name.replace(".", namespaceSeparator);
    }
    name = name.replace(new RegExp(`^${defaultNamespace}${escapeRegExp(namespaceSeparator)}`), "");
  }
  return name;
}

export function isValidI18nVarName(name: string) {
  const validI18nVarNameRegex = /^[a-zA-Z_-][a-zA-Z0-9.:_-]*$/;
  return validI18nVarNameRegex.test(name);
}

export function convertKeyToVueI18nPath(key: string, quote: string = "'"): string {
  const segments: string[] = [];
  let buffer = "";
  let escaped = false;
  // Step 1: 先解析插件形式的 key（处理转义的 .）
  for (let i = 0; i < key.length; i++) {
    const char = key[i];
    if (escaped) {
      buffer += char; // 保留转义字符
      escaped = false;
    } else if (char === "\\") {
      escaped = true; // 下一个字符需要转义
    } else if (char === ".") {
      segments.push(buffer);
      buffer = "";
    } else {
      buffer += char;
    }
  }
  if (buffer) segments.push(buffer);
  // Step 2: 将 segments 转换为 vue-i18n 表达式
  let result = segments[0];
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (/^\d+$/.test(seg)) {
      result += `[${seg}]`; // 数字：数组索引
    } else if (seg.includes(".")) {
      result += `[${quote}${seg}${quote}]`; // 含原始 . 的键
    } else {
      result += `.${seg}`; // 普通属性
    }
  }
  return result;
}
