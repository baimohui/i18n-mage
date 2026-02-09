import * as assert from "assert";
import { getDetectedLangList } from "@/core/tools/contextTools";
import { createLangContext } from "@/core/context";

describe("core/tools/contextTools", () => {
  it("getDetectedLangList 应忽略被忽略语言", () => {
    const ctx = createLangContext();
    ctx.langCountryMap = { en: { a: "1" }, "zh-cn": { a: "1" }, ja: { a: "1" } };
    ctx.ignoredLangs = ["ja"];
    const res = getDetectedLangList(ctx);
    assert.deepStrictEqual(res.sort(), ["en", "zh-cn"]);
  });
});
