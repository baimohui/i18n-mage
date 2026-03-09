/* eslint-disable @typescript-eslint/no-require-imports */
import * as assert from "assert";
import mockRequire from "mock-require";

interface ProviderConfig {
  id: string;
  baseUrl: string;
  defaultModel: string;
  useProxy: boolean;
  allowCustomModel: boolean;
  translateBatchConfig: { maxLen: number; batchSize: number; interval: number };
  generateBatchConfig: { maxLen: number; batchSize: number; interval: number };
}

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

describe("ai/providers config", () => {
  afterEach(() => {
    mockRequire.stop("@/ai/shared/openaiCompatibleProvider");
    resetModule("@/ai/providers/chatgpt");
    resetModule("@/ai/providers/deepseek");
    resetModule("@/ai/providers/doubao");
    resetModule("@/ai/providers/qwen");
    resetModule("@/ai/providers/hunyuan");
    resetModule("@/ai/providers/kimi");
  });

  it("should register expected config for all OpenAI-compatible providers", () => {
    const captured: ProviderConfig[] = [];

    mockRequire("@/ai/shared/openaiCompatibleProvider", {
      createOpenAICompatibleProvider: (config: ProviderConfig) => {
        captured.push(config);
        return {
          id: config.id,
          translate: () => Promise.resolve({ success: true, data: [] }),
          generateKey: () => Promise.resolve({ success: true, data: [] }),
          selectPrefix: () => Promise.resolve({ success: true, data: [] })
        };
      }
    });

    require("@/ai/providers/chatgpt");
    require("@/ai/providers/deepseek");
    require("@/ai/providers/doubao");
    require("@/ai/providers/qwen");
    require("@/ai/providers/hunyuan");
    require("@/ai/providers/kimi");

    const byId = Object.fromEntries(captured.map(item => [item.id, item]));

    assert.strictEqual(byId.chatgpt.baseUrl, "https://api.openai.com/v1/chat/completions");
    assert.strictEqual(byId.chatgpt.defaultModel, "gpt-4o-mini");
    assert.strictEqual(byId.chatgpt.allowCustomModel, true);

    assert.strictEqual(byId.deepseek.baseUrl, "https://api.deepseek.com/v1/chat/completions");
    assert.strictEqual(byId.deepseek.defaultModel, "deepseek-chat");
    assert.strictEqual(byId.deepseek.useProxy, false);
    assert.strictEqual(byId.deepseek.allowCustomModel, true);

    assert.strictEqual(byId.doubao.baseUrl, "https://ark.cn-beijing.volces.com/api/v3/chat/completions");
    assert.strictEqual(byId.doubao.defaultModel, "doubao-seed-1-8-251228");
    assert.strictEqual(byId.doubao.allowCustomModel, true);

    assert.strictEqual(byId.qwen.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    assert.strictEqual(byId.qwen.defaultModel, "qwen-plus");
    assert.strictEqual(byId.qwen.allowCustomModel, true);

    assert.strictEqual(byId.hunyuan.baseUrl, "https://api.hunyuan.cloud.tencent.com/v1/chat/completions");
    assert.strictEqual(byId.hunyuan.defaultModel, "hunyuan-turbos-latest");
    assert.strictEqual(byId.hunyuan.allowCustomModel, true);

    assert.strictEqual(byId.kimi.baseUrl, "https://api.moonshot.cn/v1/chat/completions");
    assert.strictEqual(byId.kimi.defaultModel, "moonshot-v1-8k");
    assert.strictEqual(byId.kimi.allowCustomModel, true);

    assert.strictEqual(captured.length, 6);
  });
});
