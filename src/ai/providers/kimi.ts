import { createOpenAICompatibleProvider } from "@/ai/shared/openaiCompatibleProvider";

const kimiProvider = createOpenAICompatibleProvider({
  id: "kimi",
  baseUrl: "https://api.moonshot.cn/v1/chat/completions",
  defaultModel: "moonshot-v1-8k",
  useProxy: true,
  allowCustomModel: true,
  translateBatchConfig: { maxLen: 4000, batchSize: 20, interval: 800 },
  generateBatchConfig: { maxLen: 2000, batchSize: 10, interval: 1100 }
});

export default kimiProvider;
