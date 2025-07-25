import { LangContextInternal, SORT_MODE, SortMode } from "@/types";
import { RewriteHandler } from "./RewriteHandler";

export class SortHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run() {
    this.ctx.updatedEntryValueInfo = Object.keys(this.ctx.langCountryMap).reduce((acc, lang) => {
      acc[lang] = {};
      return acc;
    }, {});
    return await new RewriteHandler(this.ctx).run();
  }

  public getSortedKeys(type: SortMode, lang: string) {
    if (type === SORT_MODE.ByKey) {
      const keys = Object.keys(this.ctx.langDictionary);
      return keys.sort((a, b) => a.localeCompare(b));
    } else if (type === SORT_MODE.ByPosition) {
      return [...this.ctx.usedKeySet, ...this.ctx.unusedKeySet];
    } else if (Object.hasOwn(this.ctx.langCountryMap, lang)) {
      return Object.keys(this.ctx.langCountryMap[lang]);
    } else {
      return Object.keys(this.ctx.langDictionary);
    }
  }

  public getSortedTree(sortingMode: SortMode, lang: string) {
    const sortedTree = {};
    if (!this.ctx.isFlat) return null;
    const entryTree = this.ctx.langCountryMap[lang];
    let keys = Object.keys(this.ctx.langCountryMap[lang]);
    if (!keys.length) return null;
    if (sortingMode === SORT_MODE.ByPosition) {
      keys = [...this.ctx.usedKeySet, ...this.ctx.unusedKeySet];
    } else if (sortingMode === SORT_MODE.ByKey) {
      keys.sort((a, b) => a.localeCompare(b));
    }
    keys.forEach(key => {
      if (Object.hasOwn(entryTree, key)) {
        sortedTree[key] = entryTree[key];
      }
    });
    return sortedTree;
  }
}
