import { EntryTree, EXECUTION_RESULT_CODE, LangContextInternal, LANGUAGE_STRUCTURE, SORT_MODE, SortMode } from "@/types";
import { RewriteHandler } from "./RewriteHandler";
import { t } from "@/utils/i18n";

export class SortHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run() {
    if (
      this.ctx.sortingWriteMode !== SORT_MODE.None &&
      this.ctx.avgFileNestedLevel === 0 &&
      this.ctx.languageStructure === LANGUAGE_STRUCTURE.flat
    ) {
      Object.keys(this.ctx.langCountryMap).forEach(lang => {
        if (this.ctx.ignoredLangs.includes(lang)) return;
        const sortedTree = {};
        const entryTree = this.ctx.langCountryMap[lang];
        let keys = Object.keys(this.ctx.langCountryMap[lang]);
        if (this.ctx.sortingWriteMode === SORT_MODE.ByPosition) {
          keys = [...this.ctx.usedKeySet, ...this.ctx.unusedKeySet];
        } else if (this.ctx.sortingWriteMode === SORT_MODE.ByKey) {
          keys.sort((a, b) => a.localeCompare(b));
        }
        keys.forEach(key => {
          if (Object.hasOwn(entryTree, key)) {
            sortedTree[key] = entryTree[key];
          }
        });
        this.ctx.langCountryMap[lang] = sortedTree;
      });
      return await new RewriteHandler(this.ctx).run(true);
    }
    return { code: EXECUTION_RESULT_CODE.NoSortingApplied, success: false, message: t("command.sort.sortNotPerformed") };
  }

  public getSortedKeys(type: SortMode, lang: string = "") {
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

  public getSortedTree(sortingMode: SortMode, lang: string): EntryTree {
    const sortedTree = {};
    const entryTree = this.ctx.langCountryMap[lang];
    let keys = Object.keys(this.ctx.langCountryMap[lang]);
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
