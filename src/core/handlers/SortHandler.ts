import { LangContextInternal, SORT_MODE, SortMode } from "@/types";
import { RewriteHandler } from "./RewriteHandler";

export class SortHandler {
  constructor(private ctx: LangContextInternal) {}

  public async run() {
    this.ctx.updatedEntryValueInfo = Object.keys(this.ctx.langCountryMap).reduce((acc, lang) => {
      acc[lang] = {};
      return acc;
    }, {});
    await new RewriteHandler(this.ctx).run();
  }

  public getSortedKeys(type: SortMode) {
    if (type === SORT_MODE.None) {
      return [];
    } else if (type === SORT_MODE.ByKey) {
      const keys = Object.keys(this.ctx.langDictionary);
      return keys.sort((a, b) => a.localeCompare(b));
    } else if (type === SORT_MODE.ByPosition) {
      return [...this.ctx.usedKeySet, ...this.ctx.unusedKeySet];
    }
    return [];
  }
}
