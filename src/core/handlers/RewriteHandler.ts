import fs from "fs";
import path from "path";
import { LangContextInternal, SortMode, EntryTree } from "@/types";
import {
  getFileLocationFromId,
  getContentAtLocation,
  setValueByEscapedEntryName,
  formatObjectToString,
  getPathSegsFromId
} from "@/utils/regex";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";
import { SortHandler } from "./SortHandler";

export class RewriteHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run() {
    NotificationManager.showTitle(t("command.rewrite.title"));
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
    const sortMode = getConfig<SortMode>("sorting.writeMode");
    const sortedKeys = new SortHandler(this.ctx).getSortedKeys(sortMode);
    if (entryTree !== null) {
      let needSort = false;
      const tree: EntryTree = {};
      if (Object.keys(entryTree).length === sortedKeys.length && sortedKeys.length > 0) {
        needSort = true;
        sortedKeys.forEach(key => {
          if (Object.hasOwn(entryTree, key)) {
            tree[key] = entryTree[key];
          }
        });
      }
      const fileContent = formatObjectToString(
        needSort ? tree : entryTree,
        this.ctx.langCountryMap[lang],
        filePath,
        this.ctx.langFileExtraInfo[filePos ? `${lang}.${filePos}` : lang]
      );
      await this.writeFile(filePath, fileContent);
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
        fileContent = fileContent.replaceAll(item.raw, item.fixedRaw);
      });
      await this.writeFile(fixPath, fileContent);
    }
    this.ctx.patchedEntryIdInfo = {};
  }

  private async writeFile(filePath: string, content: string) {
    try {
      await fs.promises.writeFile(filePath, content);
    } catch (e) {
      if (e instanceof Error) {
        NotificationManager.showError(t("common.progress.error", e.message));
      } else {
        NotificationManager.showError(t("common.progress.error", e as string));
      }
    }
  }
}
