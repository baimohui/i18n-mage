import fs from "fs";
import path from "path";
import { LangContextInternal, EntryTree, FileExtraInfo, INDENT_TYPE, LANGUAGE_STRUCTURE, NAMESPACE_STRATEGY } from "@/types";
import {
  getFileLocationFromId,
  getContentAtLocation,
  formatObjectToString,
  getPathSegsFromId,
  setValueByEscapedEntryName
} from "@/utils/regex";
import { t } from "@/utils/i18n";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";
import { checkPathExists, toAbsolutePath } from "@/utils/fs";
import { getDetectedLangList } from "../tools/contextTools";

export class RewriteHandler {
  constructor(private ctx: LangContextInternal) {}

  get detectedLangList() {
    return getDetectedLangList(this.ctx);
  }

  public async run(rewriteAll = false): Promise<ExecutionResult> {
    try {
      const updateInfo: Record<string, Set<string>> = {};
      for (const payload of this.ctx.updatePayloads) {
        for (const lang in payload.valueChanges) {
          this.ctx.langCountryMap[lang] ??= {};
          updateInfo[lang] ??= new Set<string>();
          const value = payload.valueChanges[lang].after ?? "";
          switch (payload.type) {
            case "add":
            case "fill":
            case "edit":
              if (value) {
                if (Object.hasOwn(this.ctx.langDictionary, payload.key)) {
                  this.ctx.langDictionary[payload.key].value[lang] = value;
                } else {
                  let fullPath = payload.key;
                  let fileScope = "";
                  if (this.ctx.fileStructure) {
                    const filePos = getFileLocationFromId(fullPath, this.ctx.fileStructure);
                    if (Array.isArray(filePos) && filePos.length > 0) {
                      fileScope = filePos.join(".");
                    } else {
                      fullPath = `${this.ctx.missingEntryFile}.${payload.key}`;
                      fileScope = this.ctx.missingEntryFile;
                    }
                    if (this.ctx.namespaceStrategy === NAMESPACE_STRATEGY.full) {
                      payload.key = fullPath;
                    } else if (this.ctx.namespaceStrategy === NAMESPACE_STRATEGY.file) {
                      payload.key = `${this.ctx.missingEntryFile.replace(/^.*\./, "")}.${payload.key}`;
                    }
                  }
                  this.ctx.langDictionary[payload.key] = { fullPath, fileScope, value: { [lang]: value } };
                }
                this.ctx.langCountryMap[lang][payload.key] = value;
                setValueByEscapedEntryName(this.ctx.entryTree, payload.key, payload.key);
              }
              break;
            case "delete":
              delete this.ctx.langDictionary[payload.key][lang];
              delete this.ctx.langCountryMap[lang][payload.key];
              setValueByEscapedEntryName(this.ctx.entryTree, payload.key, undefined);
              break;
          }
          const filePos = getFileLocationFromId(this.ctx.langDictionary[payload.key].fullPath, this.ctx.fileStructure);
          if (Array.isArray(filePos) && filePos.length > 0) updateInfo[lang].add(filePos.join("."));
        }
        if (payload.keyChange) {
          const oldKey = payload.key;
          const { key, filePos, fullPath } = payload.keyChange;
          const newKey = key.after;
          if (newKey === undefined) continue;
          for (const lang of Object.keys(this.ctx.langCountryMap)) {
            if (Object.hasOwn(this.ctx.langCountryMap[lang], oldKey)) {
              const val = this.ctx.langCountryMap[lang][oldKey];
              this.ctx.langCountryMap[lang][newKey] = val;
              delete this.ctx.langCountryMap[lang][oldKey];
            }
          }
          if (Object.hasOwn(this.ctx.langDictionary, oldKey)) {
            const oldInfo = this.ctx.langDictionary[oldKey];
            this.ctx.langDictionary[newKey] = oldInfo;
            this.ctx.langDictionary[newKey].fileScope = filePos.after;
            this.ctx.langDictionary[newKey].fullPath = fullPath.after;
            delete this.ctx.langDictionary[oldKey];
          }
          setValueByEscapedEntryName(this.ctx.entryTree, oldKey, undefined);
          setValueByEscapedEntryName(this.ctx.entryTree, newKey, newKey);
          for (const lang of this.detectedLangList) {
            updateInfo[lang] ??= new Set<string>();
            if (filePos.before !== undefined) {
              updateInfo[lang].add(filePos.before);
            }
            updateInfo[lang].add(filePos.after);
          }
        }
      }
      if (rewriteAll && this.ctx.avgFileNestedLevel === 0 && this.ctx.languageStructure === LANGUAGE_STRUCTURE.flat) {
        for (const lang of this.detectedLangList) {
          updateInfo[lang] ??= new Set<string>();
          updateInfo[lang].add("");
        }
      }
      for (const [lang, filePosSet] of Object.entries(updateInfo)) {
        if (filePosSet.size === 0) {
          await this.rewriteTranslationFile(lang, "");
        } else {
          for (const filePos of filePosSet) {
            await this.rewriteTranslationFile(lang, filePos);
          }
        }
      }
      await this.applyGlobalFixes();
      return { success: true, message: "", code: EXECUTION_RESULT_CODE.Success };
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownRewriteError };
    }
  }

  private async rewriteTranslationFile(lang: string, filePos: string): Promise<void> {
    const filePath = this.getLangFilePath(lang, filePos);
    let langObj: EntryTree = {};
    const translation = this.ctx.langCountryMap[lang];
    const iterate = (tree: string[] | EntryTree, result: string[] | EntryTree = {}) => {
      for (const [key, value] of Object.entries(tree)) {
        if (typeof value === "string") {
          if (Object.hasOwn(translation, value)) {
            result[key] = translation[value] || "";
          }
        } else if (Array.isArray(value)) {
          result[key] ??= [];
          iterate(value, result[key] as string[]);
        } else if (typeof value === "object") {
          result[key] ??= {};
          iterate(value, result[key] as EntryTree);
        }
      }
    };
    if (this.ctx.avgFileNestedLevel === 0 && this.ctx.languageStructure === LANGUAGE_STRUCTURE.flat) {
      langObj = translation;
    } else {
      const entryTree = getContentAtLocation(filePos, this.ctx.entryTree, this.ctx.langDictionary, this.ctx.namespaceStrategy);
      if (entryTree === null) {
        throw new Error(t("command.rewrite.fileNotFound", filePath));
      }
      iterate(entryTree, langObj);
    }
    let extraInfo: FileExtraInfo = {
      prefix: "",
      suffix: "",
      innerVar: "",
      indentType: INDENT_TYPE.space,
      indentSize: 2,
      isFlat: true,
      keyQuotes: "double",
      valueQuotes: "double"
    };
    const extraInfoSourceLangs = [lang, this.ctx.referredLang, ...Object.keys(this.ctx.langCountryMap)];
    for (const l of extraInfoSourceLangs) {
      const info = this.ctx.langFileExtraInfo[filePos ? `${l}.${filePos}` : l];
      if (info !== undefined) {
        extraInfo = info;
        break;
      }
    }
    if (this.ctx.quoteStyleForKey !== "auto") {
      extraInfo.keyQuotes = this.ctx.quoteStyleForKey;
    }
    if (this.ctx.quoteStyleForValue !== "auto") {
      extraInfo.valueQuotes = this.ctx.quoteStyleForValue;
    }
    if (this.ctx.indentSize !== null) {
      extraInfo.indentSize = this.ctx.indentSize;
    }
    if (this.ctx.indentType !== INDENT_TYPE.auto) {
      extraInfo.indentType = this.ctx.indentType;
    }
    if (this.ctx.languageStructure !== LANGUAGE_STRUCTURE.auto) {
      extraInfo.isFlat = this.ctx.languageStructure === LANGUAGE_STRUCTURE.flat;
    }
    const isFileExists = await checkPathExists(filePath);
    if (!isFileExists) {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    }
    const fileContent = formatObjectToString(langObj, filePath, extraInfo);
    await fs.promises.writeFile(filePath, fileContent);
  }

  private getLangFilePath(lang: string, filePos: string): string {
    if (filePos === "") {
      // 根文件：zh-CN.json
      return path.join(this.ctx.langPath, `${lang}.${this.ctx.langFileType}`);
    } else {
      const pathSegs = getPathSegsFromId(filePos);
      // 先拼出不带扩展名的完整路径，再在末尾加上 .json
      // 类似： /…/langPath/zh-CN/demos/textA + ".json"
      const withoutExt = path.join(this.ctx.langPath, lang, ...pathSegs);
      return withoutExt + `.${this.ctx.langFileType}`;
    }
  }

  private async applyGlobalFixes() {
    for (const fixPath in this.ctx.patchedEntryIdInfo) {
      const fixList = this.ctx.patchedEntryIdInfo[fixPath];
      fixList.sort((a, b) => {
        const aStartPos = parseInt(a.pos.split(",")[0], 10);
        const bStartPos = parseInt(b.pos.split(",")[0], 10);
        return aStartPos - bStartPos;
      });
      const absolutePath = toAbsolutePath(fixPath);
      const fileContent = fs.readFileSync(absolutePath, "utf8");
      let lastEndPos = 0;
      let fixedFileContent = "";
      fixList.forEach(item => {
        const [nameStartPos, nameEndPos, , endPos] = item.pos.split(",").map(pos => parseInt(pos, 10));
        if (item.fixedRaw) {
          fixedFileContent += fileContent.slice(lastEndPos, nameStartPos);
          const quoteStr = fileContent[nameStartPos];
          fixedFileContent += quoteStr + item.fixedKey + quoteStr;
          if (item.addedVars) {
            fixedFileContent += item.addedVars;
            lastEndPos = endPos - 1;
          } else {
            lastEndPos = nameEndPos;
          }
        } else {
          fixedFileContent += fileContent.slice(lastEndPos, nameEndPos);
          lastEndPos = nameEndPos;
        }
      });
      fixedFileContent += fileContent.slice(lastEndPos);
      await fs.promises.writeFile(absolutePath, fixedFileContent);
    }
    this.ctx.patchedEntryIdInfo = {};
  }
}
