import { createOpenAICompatibleProvider } from "@/ai/shared/openaiCompatibleProvider";

const qwenProvider = createOpenAICompatibleProvider({
  id: "qwen",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  defaultModel: "qwen-plus",
  useProxy: true,
  allowCustomModel: true,
  translateBatchConfig: { maxLen: 4000, batchSize: 20, interval: 800 },
  generateBatchConfig: { maxLen: 2000, batchSize: 10, interval: 1100 }
});

export default qwenProvider;
