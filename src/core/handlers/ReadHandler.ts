import fs from "fs";
import path from "path";
import {
  DirNode,
  EntryClassTreeItem,
  EntryNode,
  I18N_FRAMEWORK,
  LangContextInternal,
  LANGUAGE_STRUCTURE,
  NAMESPACE_STRATEGY,
  NamespaceStrategy
} from "@/types";
import {
  catchTEntries,
  catchLiteralEntries,
  extractLangDataFromDir,
  getValueByAmbiguousEntryName,
  flattenNestedObj,
  escapeString,
  unescapeString,
  isValidI18nCallablePath,
  stripLanguageLayer,
  getCommonFilePaths
} from "@/utils/regex";
import { EntryTree, LangDictionary, LangTree } from "@/types";
import { isFileTooLarge } from "@/utils/fs";

export class ReadHandler {
  constructor(private ctx: LangContextInternal) {}

  public readLangFiles(): void {
    const langData = extractLangDataFromDir(this.ctx.langPath);
    if (langData === null) {
      this.ctx.langPath = "";
      return;
    }
    let langTree = langData.langTree;
    let keyPathMap: Record<string, { fullPath: string; fileScope: string }> | null = null;
    this.ctx.langFileExtraInfo = langData.fileExtraInfo;
    this.ctx.langFileType = langData.fileType;
    this.ctx.fileStructure = stripLanguageLayer(langData.fileStructure);
    this.ctx.multiFileMode = langData.fileNestedLevel;
    if (this.ctx.multiFileMode > 0) {
      const { treeData, keyMap } = this.processLanguageData(langTree, this.ctx.namespaceStrategy);
      langTree = treeData;
      keyPathMap = keyMap;
    }
    Object.entries(langTree).forEach(([lang, tree]) => {
      this.ctx.langCountryMap[lang] = flattenNestedObj(tree);
    });
    const { structure, lookup } = this.buildEntryTreeAndDictionary(langTree, keyPathMap);
    this.ctx.entryTree = structure;
    this.ctx.langDictionary = lookup;
    if (this.ctx.languageStructure === LANGUAGE_STRUCTURE.auto) {
      this.ctx.languageStructure = Object.values(this.ctx.langFileExtraInfo).every(info => info.isFlat)
        ? LANGUAGE_STRUCTURE.flat
        : LANGUAGE_STRUCTURE.nested;
    }
    if (this.ctx.languageStructure === LANGUAGE_STRUCTURE.nested) {
      this.ctx.nameSeparator = ".";
      this.buildEntryClassTree(langData.langTree, this.ctx.fileStructure, this.ctx.namespaceStrategy);
    } else {
      const entryNameList = Object.keys(lookup);
      this.ctx.nameSeparator = this.detectCommonSeparator(entryNameList);
      if (this.ctx.nameSeparator) {
        entryNameList.forEach(name => this.genEntryClassTree(name));
      }
    }
  }

  public async startCensus(): Promise<void> {
    const totalEntryList = Object.keys(this.ctx.langDictionary).map(key => unescapeString(key));
    if (!this.ctx.globalFlag || totalEntryList.length === 0) return;
    const filePaths = this._readAllFiles(this.ctx.projectPath);
    this.ctx.usedEntryMap = {};
    this.ctx.undefinedEntryList = [];
    this.ctx.undefinedEntryMap = {};
    for (const filePath of filePaths) {
      if (await isFileTooLarge(filePath)) continue;
      const fileContent = fs.readFileSync(filePath, "utf8");
      const tItems = catchTEntries(fileContent);
      let usedEntryList: { name: string; pos: string }[] = [];
      if (this.ctx.scanStringLiterals) {
        const existedItems = catchLiteralEntries(fileContent, this.ctx.entryTree, path.basename(filePath));
        usedEntryList = existedItems.slice();
      }
      for (const item of tItems) {
        const nameInfo = item.nameInfo;
        let usedEntryNameList: string[] = [];
        const isEntryWithContext =
          (this.ctx.i18nFramework === I18N_FRAMEWORK.i18nNext || this.ctx.i18nFramework === I18N_FRAMEWORK.reactI18next) &&
          item.vars.length > 0;
        if (nameInfo.vars.length > 0 || isEntryWithContext) {
          usedEntryNameList = totalEntryList.filter(entry => nameInfo.regex.test(entry));
        } else {
          usedEntryNameList = getValueByAmbiguousEntryName(this.ctx.entryTree, nameInfo.name) === undefined ? [] : [nameInfo.name];
        }
        if (usedEntryNameList.length === 0) {
          if (this.ctx.ignoredUndefinedEntries.includes(nameInfo.text)) continue;
          this.ctx.undefinedEntryList.push({ ...item, path: filePath });
          this.ctx.undefinedEntryMap[nameInfo.text] ??= {};
          this.ctx.undefinedEntryMap[nameInfo.text][filePath] ??= new Set<string>();
          this.ctx.undefinedEntryMap[nameInfo.text][filePath].add(item.pos);
        } else {
          usedEntryList.push(...usedEntryNameList.map(entryName => ({ name: entryName, pos: item.pos })));
        }
      }
      usedEntryList
        .sort((a, b) => +a.pos.split(",")[0] - +b.pos.split(",")[0])
        .forEach(entry => {
          this.ctx.usedEntryMap[entry.name] ??= {};
          this.ctx.usedEntryMap[entry.name][filePath] ??= new Set<string>();
          this.ctx.usedEntryMap[entry.name][filePath].add(entry.pos);
        });
    }
    this.ctx.manuallyMarkedUsedEntries.forEach(entryName => {
      if (!Object.hasOwn(this.ctx.usedEntryMap, entryName)) {
        this.ctx.usedEntryMap[entryName] = {};
      }
    });
    for (const name in this.ctx.usedEntryMap) {
      const key = getValueByAmbiguousEntryName(this.ctx.entryTree, name);
      if (key !== undefined) {
        this.ctx.usedKeySet.add(key);
      }
    }
    for (const key in this.ctx.langDictionary) {
      const name = unescapeString(key);
      if (!Object.hasOwn(this.ctx.usedEntryMap, name)) {
        this.ctx.unusedKeySet.add(key);
      }
    }
  }

  private _readAllFiles(dir: string): string[] {
    const pathList: string[] = [];
    const results = fs.readdirSync(dir, { withFileTypes: true });
    for (let i = 0; i < results.length; i++) {
      const targetName = results[i].name;
      const tempPath = path.join(dir, targetName);
      if (isValidI18nCallablePath(tempPath)) {
        if (results[i].isDirectory()) {
          const tempPathList = this._readAllFiles(tempPath);
          pathList.push(...tempPathList);
        } else {
          pathList.push(tempPath);
        }
      }
    }
    return pathList;
  }

  private buildEntryTreeAndDictionary(langTree: LangTree, keyPathMap: Record<string, { fullPath: string; fileScope: string }> | null) {
    const structure: EntryTree = {};
    const lookup: LangDictionary = {};
    const ignoredLangs = this.ctx.ignoredLangs;
    function setAtPath(obj: string[] | EntryTree, path: string[], value: string, isFromArray: boolean): void {
      let cur = obj;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!Object.hasOwn(cur, key) || typeof cur[key] !== "object") {
          cur[key] = isFromArray && i === path.length - 2 ? [] : {};
        }
        cur = cur[key] as EntryTree | string[];
      }
      cur[path[path.length - 1]] = value;
    }
    function traverse(node: string | string[] | EntryTree, path: string[], idTree: EntryTree, lang: string, isFromArray: boolean): void {
      if (typeof node === "string") {
        const id = path.map(key => escapeString(key)).join(".");
        setAtPath(idTree, path, id, isFromArray);
        if (!(id in lookup)) {
          lookup[id] = {
            fullPath: keyPathMap?.[id] ? keyPathMap[id].fullPath : id,
            fileScope: keyPathMap?.[id] ? keyPathMap[id].fileScope : "",
            value: {}
          };
        }
        lookup[id].value[lang] = node;
      } else if (Array.isArray(node)) {
        node.forEach((item, index) => {
          traverse(item, path.concat(index.toString()), idTree, lang, true);
        });
      } else {
        for (const key in node) {
          traverse(node[key], path.concat(key), idTree, lang, false);
        }
      }
    }
    Object.entries(langTree).forEach(([lang, tree]) => {
      if (!ignoredLangs.includes(lang)) {
        traverse(tree, [], structure, lang, false);
      }
    });
    return { structure, lookup };
  }

  private buildEntryClassTree(langTree: LangTree, fileStructure: DirNode | null, namespaceStrategy: NamespaceStrategy) {
    const ignoredLangs = this.ctx.ignoredLangs;
    const commonFilePaths = getCommonFilePaths(fileStructure);
    const setAtPath = (path: string[], isEmpty = false): void => {
      const fileSegs =
        commonFilePaths
          .map(item => item.split("/"))
          .find(fileSegs => path.slice(0, fileSegs.length).every((seg, index) => seg === fileSegs[index])) ?? [];
      const filePos = fileSegs.join(".");
      if (this.ctx.entryClassTree.find(item => item.filePos === filePos) === undefined) {
        this.ctx.entryClassTree.push({ filePos, data: {} });
      }
      let entryClassTreeItem = this.ctx.entryClassTree.find(item => item.filePos === filePos)!.data;
      let fileNestedLevelOffset = 0;
      if (namespaceStrategy === NAMESPACE_STRATEGY.none) {
        fileNestedLevelOffset = fileSegs.length;
      } else if (namespaceStrategy === NAMESPACE_STRATEGY.file) {
        fileNestedLevelOffset = fileSegs.length - 1;
      }
      const entryClassTreePath = path.slice(fileNestedLevelOffset);
      for (let i = 0; i < entryClassTreePath.length - 1; i++) {
        const key = entryClassTreePath[i];
        if (!Object.hasOwn(entryClassTreeItem, key) || typeof entryClassTreeItem[key] !== "object") {
          entryClassTreeItem[key] = {};
        }
        entryClassTreeItem = entryClassTreeItem[key] as EntryClassTreeItem;
      }
      entryClassTreeItem[path[path.length - 1]] = isEmpty ? {} : null;
    };
    const traverse = (node: string | string[] | EntryTree, path: string[]): void => {
      if (Object.prototype.toString.call(node) === "[object Object]") {
        if (Object.keys(node).length === 0) {
          setAtPath(path, true);
        }
        for (const key in node as EntryTree) {
          traverse(node[key] as EntryTree, path.concat(key));
        }
      } else {
        setAtPath(path);
      }
    };
    Object.entries(langTree).forEach(([lang, tree]) => {
      if (!ignoredLangs.includes(lang)) {
        traverse(tree, []);
      }
    });
  }

  private genEntryClassTree(name: string = ""): void {
    const filePos = this.ctx.langDictionary[name].fileScope;
    let entryClassTree = this.ctx.entryClassTree.find(item => item.filePos === filePos);
    if (entryClassTree === undefined) {
      entryClassTree = { filePos, data: {} };
      this.ctx.entryClassTree.push(entryClassTree);
    }
    const structure = name.split(this.ctx.nameSeparator);
    const structureLayer = structure.length;
    let treeData = entryClassTree.data;
    structure.forEach((key, index) => {
      if (treeData[key] === undefined || treeData[key] === null) {
        if (structureLayer > index + 1) {
          treeData[key] = {};
        } else {
          treeData[key] = null;
        }
      }
      treeData = treeData[key] as EntryClassTreeItem;
    });
  }

  private detectCommonSeparator(keys: string[] = [], threshold = 0.3) {
    const separators = ["\\.", ".", "-", "_"];
    const counts = { "\\.": 0, ".": 0, "-": 0, _: 0 };
    for (const key of keys) {
      for (const sep of separators) {
        if (key.includes(sep)) {
          counts[sep]++;
          break; // 同一个词条只算一次（避免重复）
        }
      }
    }
    const total = keys.length;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const [mostUsedSep, count] = sorted[0];
    return count / total >= threshold ? mostUsedSep : "";
  }

  /**
   * 根据文件结构和语言数据生成处理后的树数据和键映射表
   * 保持语言文件中原有的键结构，不进行扁平化处理
   * @param {Object} langData 语言数据对象
   * @param {string} namespaceStrategy 命名空间策略：'full'、'file' 或 'none'
   * @returns {Object} 包含 treeData 和 keyMap 的对象
   */
  private processLanguageData(langTree: LangTree, namespaceStrategy: NamespaceStrategy) {
    const treeData: LangTree = {};
    const keyMap: Record<string, { fullPath: string; fileScope: string }> = {};

    const traverseStructure = (node: EntryNode, currentPath = "", data: EntryTree, langData: EntryTree) => {
      if (node.type === "file") {
        // 处理文件
        const pathList = currentPath.split(".");
        const fileData = pathList.reduce((acc, key) => {
          return (acc[key] ?? {}) as EntryTree;
        }, langData);
        const fileName = pathList.pop() ?? "";

        if (namespaceStrategy === NAMESPACE_STRATEGY.full || namespaceStrategy === NAMESPACE_STRATEGY.file) {
          data[fileName] ??= fileData;
        } else if (namespaceStrategy === NAMESPACE_STRATEGY.none) {
          Object.assign(data, fileData);
        }
        this.processFileData(fileData, currentPath, fileName, namespaceStrategy, keyMap);
      } else if (node.type === "directory") {
        // 递归处理子目录
        for (const [name, child] of Object.entries(node.children)) {
          let newData = data;
          if (namespaceStrategy === NAMESPACE_STRATEGY.full) {
            data[currentPath] ??= {};
            newData = data[currentPath] as EntryTree;
          }
          const newPath = currentPath ? `${currentPath}.${name}` : name;
          traverseStructure(child, newPath, newData, langData);
        }
      }
    };

    // 初始化所有语言的树数据
    for (const lang of Object.keys(langTree)) {
      treeData[lang] = {};
      if (this.ctx.fileStructure === null) continue;
      // 递归遍历目录结构
      for (const [name, child] of Object.entries(this.ctx.fileStructure.children)) {
        traverseStructure(child, name, treeData[lang], langTree[lang]);
      }
    }

    return { treeData, keyMap };
  }

  /**
   * 处理文件数据，根据命名空间策略调整键
   * @param {Object} fileData 文件数据
   * @param {string} fileScope 文件作用域（文件路径）
   * @param {string} fileName 文件名
   * @param {string} strategy 命名空间策略
   * @param {Object} langTreeData 语言树数据
   * @param {Object} keyMap 键映射表
   */
  private processFileData(
    fileData: EntryTree,
    fileScope: string,
    fileName: string,
    strategy: NamespaceStrategy,
    keyMap: Record<string, { fullPath: string; fileScope: string }>
  ) {
    // 递归处理嵌套的对象
    function processNestedObject(obj, baseKey = "") {
      for (const [key, value] of Object.entries(obj as EntryTree)) {
        const currentKey = baseKey ? `${baseKey}.${escapeString(key)}` : escapeString(key);

        if (typeof value === "object" && value !== null) {
          // 如果是嵌套对象，继续递归处理
          processNestedObject(value, currentKey);
        } else {
          // 如果是叶子节点（实际的值）
          let finalKey: string;

          switch (strategy) {
            case NAMESPACE_STRATEGY.full:
              finalKey = `${fileScope}.${currentKey}`;
              break;
            case NAMESPACE_STRATEGY.file:
              finalKey = `${fileName}.${currentKey}`;
              break;
            case NAMESPACE_STRATEGY.none:
            default:
              finalKey = currentKey;
              break;
          }

          // 添加到键映射表（如果尚未存在）
          if (!Object.hasOwn(keyMap, finalKey)) {
            keyMap[finalKey] = {
              fullPath: `${fileScope}.${currentKey}`,
              fileScope: fileScope
            };
          }
        }
      }
    }

    // 开始处理文件数据
    processNestedObject(fileData);
  }
}
