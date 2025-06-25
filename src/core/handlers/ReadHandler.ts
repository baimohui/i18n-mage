import fs from "fs";
import path from "path";
import { LangContextInternal } from "@/types";
import {
  catchAllEntries,
  extractLangDataFromDir,
  getValueByAmbiguousEntryName,
  flattenNestedObj,
  escapeString,
  unescapeString,
  getCaseType,
  isIgnoredDir
} from "@/utils/regex";
import { EntryTree, LangDictionary, LangTree } from "@/types";
import { LANG_ENTRY_SPLIT_SYMBOL } from "@/utils/langKey";

export class ReadHandler {
  constructor(private ctx: LangContextInternal) {}

  public readLangFiles(): void {
    const langData = extractLangDataFromDir(this.ctx.langDir);
    if (langData === null) {
      return;
    }
    const langTree = langData.langTree;
    this.ctx.langFileExtraInfo = langData.fileExtraInfo;
    this.ctx.langFileType = langData.fileType;
    this.ctx.langFormatType = langData.formatType;
    this.ctx.fileStructure = langData.fileStructure;
    Object.entries(langTree).forEach(([lang, data]) => {
      this.ctx.langCountryMap[lang] = flattenNestedObj(data);
    });
    const { structure, lookup } = this.mergeTreeToTwoObjectsSemantic(langTree);
    this.ctx.entryTree = structure;
    this.ctx.langDictionary = lookup;
    Object.keys(this.ctx.langDictionary).forEach(key => this._genEntryClassTree(unescapeString(key)));
  }

  public startCensus(): void {
    const filePaths = this._readAllFiles(this.ctx.rootPath);
    const pathLevelCountMap: Record<number, number> = {};
    let maxNum = 0;
    const totalEntryList = Object.keys(this.ctx.langDictionary).map(key => unescapeString(key));
    this.ctx.undefinedEntryList = [];
    this.ctx.undefinedEntryMap = {};
    for (const filePath of filePaths) {
      if (this.ctx.ignoredFileList.some(ifp => path.resolve(filePath) === path.resolve(path.join(this.ctx.rootPath, ifp)))) continue;
      const fileContent = fs.readFileSync(filePath, "utf8");
      const { tItems, existedItems } = catchAllEntries(fileContent, this.ctx.langFormatType, this.ctx.entryClassTree);
      const usedEntryList = existedItems.slice();
      if (usedEntryList.length > maxNum) {
        maxNum = usedEntryList.length;
        this.ctx.roguePath = filePath;
      }
      for (const item of tItems) {
        const nameInfo = item.nameInfo;
        let usedEntryNameList: string[] = [];
        if (nameInfo.vars.length > 0) {
          usedEntryNameList = totalEntryList.filter(entry => nameInfo.regex.test(entry));
        } else {
          usedEntryNameList = getValueByAmbiguousEntryName(this.ctx.entryTree, nameInfo.text) === undefined ? [] : [nameInfo.text];
        }
        if (usedEntryNameList.length === 0) {
          this.ctx.undefinedEntryList.push({ ...item, path: filePath });
          this.ctx.undefinedEntryMap[nameInfo.text] ??= {};
          this.ctx.undefinedEntryMap[nameInfo.text][filePath] ??= [];
          this.ctx.undefinedEntryMap[nameInfo.text][filePath].push(item.pos);
        } else {
          usedEntryList.push(...usedEntryNameList.map(entryName => ({ name: entryName, pos: item.pos })));
        }
      }
      // usedEntryList = [...new Set(usedEntryList)];
      if (usedEntryList.length > 0) {
        const count = filePath.split("\\").length - 1;
        pathLevelCountMap[count] ??= 0;
        pathLevelCountMap[count]++;
        usedEntryList.forEach(entry => {
          this.ctx.usedEntryMap[entry.name] ??= {};
          this.ctx.usedEntryMap[entry.name][filePath] ??= [];
          if (!this.ctx.usedEntryMap[entry.name][filePath].includes(entry.pos)) {
            this.ctx.usedEntryMap[entry.name][filePath].push(entry.pos);
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
    this.ctx.primaryPathLevel = primaryPathLevel;
  }

  private _readAllFiles(dir: string): string[] {
    const pathList: string[] = [];
    const results = fs.readdirSync(dir, { withFileTypes: true });
    for (let i = 0; i < results.length; i++) {
      const targetName = results[i].name;
      const tempPath = path.join(dir, targetName);
      const isLangDir = path.resolve(tempPath) === path.resolve(this.ctx.langDir);
      if (results[i].isDirectory() && !isIgnoredDir(targetName) && !isLangDir) {
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

  private mergeTreeToTwoObjectsSemantic(langTree: LangTree): { structure: EntryTree; lookup: LangDictionary } {
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

  private _genEntryClassTree(name: string = ""): void {
    const splitSymbol = LANG_ENTRY_SPLIT_SYMBOL[this.ctx.langFormatType] as string;
    const structure = name.split(splitSymbol);
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
}
