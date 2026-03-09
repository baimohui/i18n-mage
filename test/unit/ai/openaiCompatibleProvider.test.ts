/* eslint-disable @typescript-eslint/no-require-imports */
import * as assert from "assert";
import mockRequire from "mock-require";

type MockTaskResult = {
  success: boolean;
  data?: string[];
  message?: string;
};

function resetModule(modulePath: string) {
  try {
    const resolved = require.resolve(modulePath);
    if (require.cache[resolved]) {
      delete require.cache[resolved];
    }
  } catch {
    // ignore
  }
}

describe("ai/shared/openaiCompatibleProvider", () => {
  afterEach(() => {
    mockRequire.stop("axios");
    mockRequire.stop("@/utils/proxy");
    mockRequire.stop("@/ai/shared/batchTranslate");
    mockRequire.stop("@/ai/shared/batchGenerate");
    mockRequire.stop("@/ai/shared/listOutput");
    mockRequire.stop("@/utils/i18n");
    resetModule("@/ai/shared/openaiCompatibleProvider");
  });

  it("translate should use default model when custom model is disabled", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; config: Record<string, unknown> }> = [];
    mockRequire("axios", {
      post: (url: string, body: Record<string, unknown>, config: Record<string, unknown>) => {
        calls.push({ url, body, config });
        return Promise.resolve({ data: { choices: [{ message: { content: "mock" } }] } });
      }
    });
    mockRequire("@/utils/proxy", { getProxyAgent: () => "AGENT" });
    mockRequire("@/utils/i18n", { t: (_key: string, value: string) => value });
    mockRequire("@/ai/shared/listOutput", {
      buildIndexedItems: (_list: string[]) => '<item i="0">a</item>',
      parseListOutput: (_content: string, _len: number) => ["translated"]
    });
    mockRequire("@/ai/shared/batchTranslate", {
      batchTranslate: async (
        _source: string,
        _target: string,
        sourceTextList: string[],
        _cfg: Record<string, unknown>,
        worker: (sourceCode: string, targetCode: string, sourceList: string[]) => Promise<MockTaskResult>
      ) => {
        return await worker("en", "zh-CN", sourceTextList);
      }
    });
    mockRequire("@/ai/shared/batchGenerate", {
      batchGenerate: () => Promise.resolve({ success: true, data: [] })
    });

    const { createOpenAICompatibleProvider } =
      require("@/ai/shared/openaiCompatibleProvider") as typeof import("@/ai/shared/openaiCompatibleProvider");
    const provider = createOpenAICompatibleProvider({
      id: "chatgpt",
      baseUrl: "https://example.com/chat/completions",
      defaultModel: "default-model",
      useProxy: true,
      allowCustomModel: false,
      translateBatchConfig: { maxLen: 100, batchSize: 2, interval: 1 },
      generateBatchConfig: { maxLen: 100, batchSize: 2, interval: 1 }
    });

    const result = await provider.translate({
      source: "en",
      target: "zh-CN",
      sourceTextList: ["a"],
      apiId: "custom-model",
      apiKey: "k"
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].body.model, "default-model");
    assert.strictEqual(calls[0].config.httpsAgent, "AGENT");
  });

  it("translate should use custom model when enabled and pass batch config", async () => {
    const calls: Array<{ body: Record<string, unknown> }> = [];
    const batchConfigs: Array<Record<string, unknown>> = [];
    mockRequire("axios", {
      post: (_url: string, body: Record<string, unknown>) => {
        calls.push({ body });
        return Promise.resolve({ data: { choices: [{ message: { content: "mock" } }] } });
      }
    });
    mockRequire("@/utils/proxy", { getProxyAgent: () => "AGENT" });
    mockRequire("@/utils/i18n", { t: (_key: string, value: string) => value });
    mockRequire("@/ai/shared/listOutput", {
      buildIndexedItems: (_list: string[]) => '<item i="0">a</item>',
      parseListOutput: (_content: string, _len: number) => ["translated"]
    });
    mockRequire("@/ai/shared/batchTranslate", {
      batchTranslate: async (
        _source: string,
        _target: string,
        sourceTextList: string[],
        cfg: Record<string, unknown>,
        worker: (sourceCode: string, targetCode: string, sourceList: string[]) => Promise<MockTaskResult>
      ) => {
        batchConfigs.push(cfg);
        return await worker("en", "zh-CN", sourceTextList);
      }
    });
    mockRequire("@/ai/shared/batchGenerate", {
      batchGenerate: () => Promise.resolve({ success: true, data: [] })
    });

    const { createOpenAICompatibleProvider } =
      require("@/ai/shared/openaiCompatibleProvider") as typeof import("@/ai/shared/openaiCompatibleProvider");
    const provider = createOpenAICompatibleProvider({
      id: "qwen",
      baseUrl: "https://example.com/chat/completions",
      defaultModel: "default-model",
      useProxy: false,
      allowCustomModel: true,
      translateBatchConfig: { maxLen: 4000, batchSize: 20, interval: 800 },
      generateBatchConfig: { maxLen: 2000, batchSize: 10, interval: 1100 }
    });

    const result = await provider.translate({
      source: "en",
      target: "zh-CN",
      sourceTextList: ["a"],
      apiId: "custom-model",
      apiKey: "k"
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls[0].body.model, "custom-model");
    assert.deepStrictEqual(batchConfigs[0], { maxLen: 4000, batchSize: 20, interval: 800 });
  });

  it("generateKey should pass generate batch config", async () => {
    const batchConfigs: Array<Record<string, unknown>> = [];
    mockRequire("axios", {
      post: () => Promise.resolve({ data: { choices: [{ message: { content: "mock" } }] } })
    });
    mockRequire("@/utils/proxy", { getProxyAgent: () => "AGENT" });
    mockRequire("@/utils/i18n", { t: (_key: string, value: string) => value });
    mockRequire("@/ai/shared/listOutput", {
      buildIndexedItems: (_list: string[]) => '<item i="0">a</item>',
      parseListOutput: (_content: string, _len: number) => ["helloKey"]
    });
    mockRequire("@/ai/shared/batchTranslate", {
      batchTranslate: () => Promise.resolve({ success: true, data: [] })
    });
    mockRequire("@/ai/shared/batchGenerate", {
      batchGenerate: async (
        sourceTextList: string[],
        _style: string,
        _maxLen: number,
        cfg: Record<string, unknown>,
        worker: (sourceList: string[], style: string, maxLen: number) => Promise<MockTaskResult>
      ) => {
        batchConfigs.push(cfg);
        return await worker(sourceTextList, "camelCase", 40);
      }
    });

    const { createOpenAICompatibleProvider } =
      require("@/ai/shared/openaiCompatibleProvider") as typeof import("@/ai/shared/openaiCompatibleProvider");
    const provider = createOpenAICompatibleProvider({
      id: "doubao",
      baseUrl: "https://example.com/chat/completions",
      defaultModel: "doubao-default",
      useProxy: true,
      allowCustomModel: true,
      translateBatchConfig: { maxLen: 100, batchSize: 2, interval: 1 },
      generateBatchConfig: { maxLen: 2000, batchSize: 10, interval: 1100 }
    });

    const result = await provider.generateKey({
      sourceTextList: ["hello world"],
      style: "camelCase",
      maxLen: 40,
      apiId: "model-x",
      apiKey: "k"
    });

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(batchConfigs[0], { maxLen: 2000, batchSize: 10, interval: 1100 });
  });

  it("selectPrefix should return failure when candidates are empty", async () => {
    let postCalled = false;
    mockRequire("axios", {
      post: () => {
        postCalled = true;
        return Promise.resolve({ data: { choices: [{ message: { content: "mock" } }] } });
      }
    });
    mockRequire("@/utils/proxy", { getProxyAgent: () => "AGENT" });
    mockRequire("@/utils/i18n", { t: (_key: string, value: string) => value });
    mockRequire("@/ai/shared/listOutput", {
      buildIndexedItems: (_list: string[]) => '<item i="0">a</item>',
      parseListOutput: (_content: string, _len: number) => ["common"]
    });
    mockRequire("@/ai/shared/batchTranslate", {
      batchTranslate: () => Promise.resolve({ success: true, data: [] })
    });
    mockRequire("@/ai/shared/batchGenerate", {
      batchGenerate: () => Promise.resolve({ success: true, data: [] })
    });

    const { createOpenAICompatibleProvider } =
      require("@/ai/shared/openaiCompatibleProvider") as typeof import("@/ai/shared/openaiCompatibleProvider");
    const provider = createOpenAICompatibleProvider({
      id: "kimi",
      baseUrl: "https://example.com/chat/completions",
      defaultModel: "moonshot-v1-8k",
      useProxy: true,
      allowCustomModel: true,
      translateBatchConfig: { maxLen: 100, batchSize: 2, interval: 1 },
      generateBatchConfig: { maxLen: 100, batchSize: 2, interval: 1 }
    });

    const result = await provider.selectPrefix({
      sourceTextList: ["Submit"],
      prefixCandidates: [],
      apiId: "moonshot-v1-8k",
      apiKey: "k"
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.message, "No prefix candidates provided");
    assert.strictEqual(postCalled, false);
  });
});
