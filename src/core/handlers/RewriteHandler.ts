import fs from "fs";
import path from "path";
import { LangContextInternal, EntryTree } from "@/types";
import {
  getFileLocationFromId,
  getContentAtLocation,
  setValueByEscapedEntryName,
  formatObjectToString,
  getPathSegsFromId
} from "@/utils/regex";
import { t } from "@/utils/i18n";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";
import { checkPathExists } from "@/utils/fs";

export class RewriteHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run(): Promise<ExecutionResult> {
    try {
      for (const [lang, entryInfo] of Object.entries(this.ctx.updatedEntryValueInfo)) {
        const filePosSet = new Set<string>();
        for (const [key, value] of Object.entries(entryInfo)) {
          this.updateEntryValue(key, value, lang);
          const structure = this.ctx.fileStructure?.children?.[lang];
          if (!structure) continue;
          const filePos = getFileLocationFromId(this.ctx.langDictionary[key].fullPath, structure);
          if (Array.isArray(filePos) && filePos.length > 0) filePosSet.add(filePos.join("."));
        }
        const filePosList = Array.from(filePosSet);
        if (filePosList.length === 0) {
          await this.rewriteTranslationFile(lang, "");
        } else {
          for (const filePos of filePosList) {
            await this.rewriteTranslationFile(lang, filePos);
          }
        }
      }
      this.ctx.updatedEntryValueInfo = {};
      await this.applyGlobalFixes();
      return { success: true, message: "", code: EXECUTION_RESULT_CODE.Success };
    } catch (e: unknown) {
      const errorMessage = t("common.progress.error", e instanceof Error ? e.message : (e as string));
      return { success: false, message: errorMessage, code: EXECUTION_RESULT_CODE.UnknownRewriteError };
    }
  }

  private updateEntryValue(key: string, value: string | undefined, lang: string): void {
    if (typeof value === "string") {
      if (Object.hasOwn(this.ctx.langDictionary, key)) {
        this.ctx.langDictionary[key].value[lang] = value;
      } else {
        this.ctx.langDictionary[key] = { fullPath: "", fileScope: "", value: { [lang]: value } };
      }
      this.ctx.langCountryMap[lang][key] = value;
      setValueByEscapedEntryName(this.ctx.entryTree, key, key);
    } else {
      delete this.ctx.langDictionary[key][lang];
      delete this.ctx.langCountryMap[lang][key];
      setValueByEscapedEntryName(this.ctx.entryTree, key, undefined);
    }
  }

  private async rewriteTranslationFile(lang: string, filePos: string): Promise<void> {
    const filePath = this.getLangFilePath(lang, filePos);
    const isFileExists = await checkPathExists(filePath);
    if (!isFileExists) {
      throw new Error(t("command.rewrite.fileNotFound", filePath));
    }
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
    if (this.ctx.multiFileMode === 0 && this.ctx.nestedLocale === 0) {
      langObj = translation;
    } else {
      const entryTree = getContentAtLocation(filePos, this.ctx.entryTree, this.ctx.langDictionary);
      if (entryTree) {
        iterate(entryTree, langObj);
      }
    }
    if (Object.keys(langObj).length > 0) {
      const extraInfo = this.ctx.langFileExtraInfo[filePos ? `${lang}.${filePos}` : lang];
      if (this.ctx.quoteStyleForKey !== "auto") {
        extraInfo.keyQuotes = this.ctx.quoteStyleForKey;
      }
      if (this.ctx.quoteStyleForValue !== "auto") {
        extraInfo.valueQuotes = this.ctx.quoteStyleForValue;
      }
      if (this.ctx.languageFileIndent !== null) {
        extraInfo.indentSize = this.ctx.languageFileIndent;
      }
      const fileContent = formatObjectToString(langObj, filePath, extraInfo);
      await fs.promises.writeFile(filePath, fileContent);
    }
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
      let fileContent = fs.readFileSync(fixPath, "utf8");
      const fixList = this.ctx.patchedEntryIdInfo[fixPath];
      fixList.forEach(item => {
        if (item.fixedRaw) {
          fileContent = fileContent.replaceAll(item.raw, item.fixedRaw);
        }
      });
      await fs.promises.writeFile(fixPath, fileContent);
    }
    this.ctx.patchedEntryIdInfo = {};
  }
}
