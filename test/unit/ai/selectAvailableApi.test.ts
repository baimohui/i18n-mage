import * as assert from "assert";
import { normalizeApiPriority, selectAvailableApiList } from "@/ai/shared/selectAvailableApi";

describe("ai/shared/selectAvailableApi", () => {
  it("normalizeApiPriority should keep known ids order, dedupe, and append missing providers", () => {
    const apiMap = {
      chatgpt: ["gpt-4o-mini", "k1"],
      deepseek: ["deepseek-chat", "k2"],
      doubao: ["doubao-seed", "k3"]
    };

    const result = normalizeApiPriority(["unknown", "deepseek", "deepseek", "chatgpt"], apiMap);
    assert.deepStrictEqual(result, ["deepseek", "chatgpt", "doubao"]);
  });

  it("selectAvailableApiList should only return providers with complete credentials", () => {
    const apiMap = {
      chatgpt: ["gpt-4o-mini", "k1"],
      deepseek: ["deepseek-chat", ""],
      doubao: ["", "k3"],
      qwen: ["qwen-plus", "k4"]
    };

    const result = selectAvailableApiList(["chatgpt"], apiMap);
    assert.deepStrictEqual(result, ["chatgpt", "qwen"]);
  });

  it("selectAvailableApiList should work with empty priority by using map order fallback", () => {
    const apiMap = {
      google: ["none", "k1"],
      youdao: ["appId", "appKey"]
    };

    const result = selectAvailableApiList([], apiMap);
    assert.deepStrictEqual(result, ["google", "youdao"]);
  });
});
