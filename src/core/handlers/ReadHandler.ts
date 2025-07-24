import fs from "fs";
import path from "path";
import { I18N_FRAMEWORK, LangContextInternal } from "@/types";
import {
  catchTEntries,
  catchPossibleEntries,
  extractLangDataFromDir,
  getValueByAmbiguousEntryName,
  flattenNestedObj,
  escapeString,
  unescapeString,
  getCaseType,
  displayToInternalName,
  isValidI18nCallablePath
} from "@/utils/regex";
import { EntryTree, LangDictionary, LangTree } from "@/types";

export class ReadHandler {
  constructor(private ctx: LangContextInternal) {}

  public readLangFiles(): void {
    const langData = extractLangDataFromDir(this.ctx.langPath);
    if (langData === null) {
      this.ctx.langPath = "";
      return;
    }
    const langTree = langData.langTree;
    this.ctx.langFileExtraInfo = langData.fileExtraInfo;
    this.ctx.langFileType = langData.fileType;
    this.ctx.fileStructure = langData.fileStructure;
    Object.entries(langTree).forEach(([lang, tree]) => {
      const { data, isFlat } = flattenNestedObj(tree);
      this.ctx.langCountryMap[lang] = data;
      if (!isFlat) this.ctx.isFlat = false;
    });
    const { structure, lookup } = this.buildEntryTreeAndDictionary(langTree);
    this.ctx.entryTree = structure;
    this.ctx.langDictionary = lookup;
    if (this.ctx.keyPrefix === "auto-popular") {
      const entryNameList = Object.keys(lookup).map(key => unescapeString(key));
      this.ctx.nameSeparator = this.detectCommonSeparator(entryNameList);
      if (this.ctx.nameSeparator) {
        entryNameList.forEach(name => this.genEntryClassTree(name));
      }
    }
  }

  public startCensus(): void {
    const filePaths = this._readAllFiles(this.ctx.projectPath);
    const totalEntryList = Object.keys(this.ctx.langDictionary).map(key => unescapeString(key));
    this.ctx.usedEntryMap = {};
    this.ctx.undefinedEntryList = [];
    this.ctx.undefinedEntryMap = {};
    for (const filePath of filePaths) {
      const fileContent = fs.readFileSync(filePath, "utf8");
      const tItems = catchTEntries(fileContent);
      let usedEntryList: { name: string; pos: string }[] = [];
      if (this.ctx.scanStringLiterals) {
        const existedItems = catchPossibleEntries(fileContent, this.ctx.entryTree);
        usedEntryList = existedItems.slice();
      }
      for (const item of tItems) {
        const nameInfo = item.nameInfo;
        let usedEntryNameList: string[] = [];
        const entryName = displayToInternalName(nameInfo.text);
        const isEntryWithContext =
          (this.ctx.i18nFramework === I18N_FRAMEWORK.i18nNext || this.ctx.i18nFramework === I18N_FRAMEWORK.reactI18next) &&
          item.vars.length > 0;
        if (nameInfo.vars.length > 0 || isEntryWithContext) {
          usedEntryNameList = totalEntryList.filter(entry => nameInfo.regex.test(entry));
        } else {
          usedEntryNameList = getValueByAmbiguousEntryName(this.ctx.entryTree, entryName) === undefined ? [] : [entryName];
        }
        if (usedEntryNameList.length === 0) {
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
      const isLangPath = path.resolve(tempPath) === path.resolve(this.ctx.langPath);
      if (results[i].isDirectory() && isValidI18nCallablePath(tempPath) && !isLangPath) {
        const tempPathList = this._readAllFiles(tempPath);
        pathList.push(...tempPathList);
      }
      if (!results[i].isDirectory() && isValidI18nCallablePath(tempPath)) {
        pathList.push(tempPath);
      }
    }
    return pathList;
  }

  private buildEntryTreeAndDictionary(langTree: LangTree): { structure: EntryTree; lookup: LangDictionary } {
    const structure: EntryTree = {};
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
    function traverse(node: string | EntryTree, path: string[], idTree: EntryTree, label: string): void {
      if (typeof node === "string") {
        const id = path.map(key => escapeString(key)).join(".");
        setAtPath(idTree, path, id);
        if (!(id in lookup)) {
          lookup[id] = {};
        }
        lookup[id][label] = node;
      } else {
        for (const key in node) {
          traverse(node[key], path.concat(key), idTree, label);
        }
      }
    }
    Object.entries(langTree).forEach(([lang, tree]) => {
      traverse(tree, [], structure, lang);
    });
    return { structure, lookup };
  }

  private genEntryClassTree(name: string = ""): void {
    const structure = name.split(this.ctx.nameSeparator);
    const structureLayer = structure.length;
    const primaryClass = structure[0];
    if (Object.hasOwn(this.ctx.entryClassInfo, primaryClass)) {
      const classInfo = this.ctx.entryClassInfo[primaryClass];
      classInfo.num++;
      if (!classInfo.layer.includes(structureLayer)) {
        classInfo.layer.push(structureLayer);
      }
    } else {
      this.ctx.entryClassInfo[primaryClass] = {
        num: 1,
        layer: [structureLayer],
        case: getCaseType(primaryClass),
        childrenCase: {}
      };
    }
    let tempObj = this.ctx.entryClassTree;
    structure.forEach((key, index) => {
      if (tempObj[key] === undefined || tempObj[key] === null) {
        if (structureLayer > index + 1) {
          tempObj[key] = {};
        } else {
          tempObj[key] = null;
          const keyCase = getCaseType(key);
          const childrenCase = this.ctx.entryClassInfo[primaryClass].childrenCase;
          childrenCase[keyCase] ??= 0;
          childrenCase[keyCase]++;
        }
      }
      tempObj = tempObj[key] as object;
    });
  }

  private detectCommonSeparator(keys: string[] = [], threshold = 0.3) {
    const separators = [".", "-", "_"];
    const counts = { ".": 0, "-": 0, _: 0 };
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
}
