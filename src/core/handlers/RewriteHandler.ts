import fs from "fs";
import path from "path";
import { LangContextInternal, EntryTree, FileExtraInfo, INDENT_TYPE } from "@/types";
import {
  getFileLocationFromId,
  getContentAtLocation,
  formatObjectToString,
  getPathSegsFromId,
  setValueByEscapedEntryName
} from "@/utils/regex";
import { t } from "@/utils/i18n";
import { ExecutionResult, EXECUTION_RESULT_CODE } from "@/types";
import { checkPathExists } from "@/utils/fs";

export class RewriteHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run(): Promise<ExecutionResult> {
    try {
      const updateInfo: Record<string, Set<string>> = {};
      for (const payload of this.ctx.updatePayloads) {
        for (const lang in payload.changes) {
          updateInfo[lang] ??= new Set<string>();
          const key = payload.key;
          const value = payload.changes[lang].after ?? "";
          switch (payload.type) {
            case "add":
            case "fill":
            case "edit":
              if (value) {
                if (Object.hasOwn(this.ctx.langDictionary, key)) {
                  this.ctx.langDictionary[key].value[lang] = value;
                } else {
                  this.ctx.langDictionary[key] = { fullPath: "", fileScope: "", value: { [lang]: value } };
                }
                this.ctx.langCountryMap[lang][key] = value;
                setValueByEscapedEntryName(this.ctx.entryTree, key, key);
              }
              break;
            case "delete":
              delete this.ctx.langDictionary[payload.key][lang];
              delete this.ctx.langCountryMap[lang][payload.key];
              setValueByEscapedEntryName(this.ctx.entryTree, payload.key, undefined);
              break;
          }
          if (!this.ctx.fileStructure) continue;
          const filePos = getFileLocationFromId(this.ctx.langDictionary[payload.key].fullPath, this.ctx.fileStructure);
          if (Array.isArray(filePos) && filePos.length > 0) updateInfo[lang].add(filePos.join("."));
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
      this.ctx.updatePayloads = [];
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
    if (this.ctx.multiFileMode === 0 && this.ctx.nestedLocale === 0) {
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
      nestedLevel: 1,
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
