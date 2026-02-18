import { EntryTree, EXECUTION_RESULT_CODE, LangContextInternal, LANGUAGE_STRUCTURE, SORT_MODE, SortMode } from "@/types";
import { RewriteHandler } from "./RewriteHandler";
import { t } from "@/utils/i18n";

export class SortHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run() {
    const canSortFlat = this.ctx.avgFileNestedLevel === 0 && this.ctx.languageStructure === LANGUAGE_STRUCTURE.flat;
    const canSortNestedByKey = this.ctx.languageStructure === LANGUAGE_STRUCTURE.nested && this.ctx.sortingWriteMode === SORT_MODE.ByKey;
    if (this.ctx.sortingWriteMode !== SORT_MODE.None && (canSortFlat || canSortNestedByKey)) {
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
      if (canSortNestedByKey) {
        this.ctx.entryTree = this.getKeySortedEntryTree(this.ctx.entryTree);
      }
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

  private getKeySortedEntryTree(tree: EntryTree): EntryTree {
    const sorted: EntryTree = {};
    Object.keys(tree)
      .sort((a, b) => a.localeCompare(b))
      .forEach(key => {
        const value = tree[key];
        if (Array.isArray(value)) {
          sorted[key] = [...value];
        } else if (typeof value === "object" && value !== null) {
          sorted[key] = this.getKeySortedEntryTree(value);
        } else {
          sorted[key] = value;
        }
      });
    return sorted;
  }
}
