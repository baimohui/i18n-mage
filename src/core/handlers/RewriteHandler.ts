import fs from "fs";
import path from "path";
import { LangContextInternal } from "@/types";
import { printInfo, printTitle } from "@/utils/print";
import { formatEntriesInTerminal } from "@/utils/print";
import {
  getFileLocationFromId,
  getContentAtLocation,
  setValueByEscapedEntryName,
  formatObjectToString,
  getPathSegsFromId
} from "@/utils/regex";

export class RewriteHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run() {
    printTitle("写入翻译条目");
    for (const [lang, entryInfo] of Object.entries(this.ctx.updatedEntryValueInfo)) {
      const filePosSet = new Set<string>();
      for (const [key, value] of Object.entries(entryInfo)) {
        this.updateEntryValue(key, value, lang);
        const structure = this.ctx.fileStructure?.children?.[lang];
        if (!structure) continue;
        const filePos = getFileLocationFromId(key, structure);
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
  }

  private updateEntryValue(key: string, value: string | undefined, lang: string): void {
    if (typeof value === "string") {
      if (Object.hasOwn(this.ctx.langDictionary, key)) {
        this.ctx.langDictionary[key][lang] = value;
      } else {
        this.ctx.langDictionary[key] = { [lang]: value };
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
    const entryTree = getContentAtLocation(filePos, this.ctx.entryTree);
    if (entryTree) {
      const fileContent = formatObjectToString(
        entryTree,
        this.ctx.langCountryMap[lang],
        this.ctx.langFileType,
        this.ctx.langFileExtraInfo[filePos ? `${lang}.${filePos}` : lang]
      );
      await this.writeFile(filePath, fileContent);
    }
  }

  private getLangFilePath(lang: string, filePos: string): string {
    if (filePos === "") {
      // 根文件：zh-CN.json
      return path.join(this.ctx.langDir, `${lang}.${this.ctx.langFileType}`);
    } else {
      const pathSegs = getPathSegsFromId(filePos);
      // 先拼出不带扩展名的完整路径，再在末尾加上 .json
      // 类似： /…/langDir/zh-CN/demos/textA + ".json"
      const withoutExt = path.join(this.ctx.langDir, lang, ...pathSegs);
      return withoutExt + `.${this.ctx.langFileType}`;
    }
  }

  private async applyGlobalFixes() {
    for (const fixPath in this.ctx.patchedEntryIdInfo) {
      let fileContent = fs.readFileSync(fixPath, "utf8");
      const fixList = this.ctx.patchedEntryIdInfo[fixPath];
      fixList.forEach(item => {
        fileContent = fileContent.replaceAll(item.raw, item.fixedRaw as string);
      });
      await this.writeFile(fixPath, fileContent);
      const fixedEntries = formatEntriesInTerminal(
        fixList.map(item => `\x1b[31m${item.text}\x1b[0m -> \x1b[32m${item.name}\x1b[0m`),
        false
      );
      printInfo(`文件 ${this.getRelativePath(fixPath)} 修正条目：${fixedEntries}`, "mage");
    }
    this.ctx.patchedEntryIdInfo = {};
  }

  private async writeFile(filePath: string, content: string) {
    try {
      await fs.promises.writeFile(filePath, content);
      printInfo(`已写入`, "success");
    } catch (e) {
      if (e instanceof Error) {
        printInfo(`写入失败，出现异常报错：${e.message}`, "demon");
      } else {
        printInfo(`写入失败，出现非 Error 类型的报错：${e as string}`, "demon");
      }
    }
  }

  private getRelativePath(str: string = ""): string {
    const rootDir = path.resolve(this.ctx.langDir, "../..");
    return path.relative(rootDir, str) || "ROOT DIRECTORY";
  }
}
