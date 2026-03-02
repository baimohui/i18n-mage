import * as assert from "assert";
import { UNMATCHED_LANGUAGE_ACTION } from "@/types";
import { planEnglishKeyGeneration, planTextsByLanguage } from "@/core/extract/extractTextPlanner";

describe("core/extract/extractTextPlanner", () => {
  it("should ignore non-source texts when unmatchedLanguageAction=ignore", () => {
    const res = planTextsByLanguage({
      uniqueTexts: ["中文文案", "English Text"],
      referredLang: "zh-CN",
      onlyExtractSourceLanguageText: false,
      validateLanguageBeforeTranslate: true,
      unmatchedLanguageAction: UNMATCHED_LANGUAGE_ACTION.ignore
    });
    assert.deepStrictEqual(res.uniqueTexts, ["中文文案"]);
    assert.strictEqual(res.skippedTextSet.has("English Text"), true);
    assert.strictEqual(res.sourceLangMap.get("中文文案"), "zh-CN");
  });

  it("should mark non-source texts as fill-with-original when unmatchedLanguageAction=fill", () => {
    const res = planTextsByLanguage({
      uniqueTexts: ["中文文案", "English Text"],
      referredLang: "zh-CN",
      onlyExtractSourceLanguageText: false,
      validateLanguageBeforeTranslate: true,
      unmatchedLanguageAction: UNMATCHED_LANGUAGE_ACTION.fill
    });
    assert.deepStrictEqual(res.uniqueTexts, ["中文文案", "English Text"]);
    assert.strictEqual(res.fillWithOriginalTextSet.has("English Text"), true);
    assert.strictEqual(res.skippedTextSet.size, 0);
  });

  it("should switch source language for non-source texts when unmatchedLanguageAction=switch", () => {
    const res = planTextsByLanguage({
      uniqueTexts: ["中文文案", "English Text"],
      referredLang: "zh-CN",
      onlyExtractSourceLanguageText: false,
      validateLanguageBeforeTranslate: true,
      unmatchedLanguageAction: UNMATCHED_LANGUAGE_ACTION.switch,
      switchedLangByText: {
        "English Text": "en"
      }
    });
    assert.deepStrictEqual(res.uniqueTexts, ["中文文案", "English Text"]);
    assert.strictEqual(res.sourceLangMap.get("English Text"), "en");
  });

  it("should group english key-generation translation by actual source language", () => {
    const sourceLangMap = new Map<string, string>([
      ["中文文案", "zh-CN"],
      ["English Text", "en"]
    ]);
    const res = planEnglishKeyGeneration({
      uniqueTexts: ["中文文案", "English Text"],
      sourceLangMap,
      fillWithOriginalTextSet: new Set<string>()
    });
    assert.deepStrictEqual(res.translationGroups, {
      "zh-CN": ["中文文案"]
    });
    assert.strictEqual(res.directTextSet.has("English Text"), true);
    assert.strictEqual(res.directTextSet.has("中文文案"), false);
  });
});
