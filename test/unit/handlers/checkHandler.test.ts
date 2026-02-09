import * as assert from "assert";
import { CheckHandler } from "@/core/handlers/CheckHandler";
import { createLangContext } from "@/core/context";

describe("core/handlers/CheckHandler", () => {
  it("应识别缺失与空翻译", () => {
    const ctx = createLangContext();
    ctx.langCountryMap = {
      en: { a: "1", b: "" },
      zh: { a: "1" }
    };
    ctx.langDictionary = {
      a: { fullPath: "a", fileScope: "", value: { en: "1", zh: "1" } },
      b: { fullPath: "b", fileScope: "", value: { en: "" } }
    };
    ctx.syncBasedOnReferredEntries = false;
    ctx.ignoredLangs = [];
    const handler = new CheckHandler(ctx);
    handler.run();
    assert.deepStrictEqual(ctx.lackInfo.zh, ["b"]);
    assert.deepStrictEqual(ctx.nullInfo.en, ["b"]);
  });

  it("syncBasedOnReferredEntries 模式应识别多余词条", () => {
    const ctx = createLangContext();
    ctx.langCountryMap = {
      en: { a: "1" },
      zh: { a: "1", c: "2" }
    };
    ctx.referredLang = "en";
    ctx.syncBasedOnReferredEntries = true;
    ctx.ignoredLangs = [];
    const handler = new CheckHandler(ctx);
    handler.run();
    assert.deepStrictEqual(ctx.extraInfo.zh, ["c"]);
  });
});
