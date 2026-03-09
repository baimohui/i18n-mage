import { createOpenAICompatibleProvider } from "@/ai/shared/openaiCompatibleProvider";

const deepseekProvider = createOpenAICompatibleProvider({
  id: "deepseek",
  baseUrl: "https://api.deepseek.com/v1/chat/completions",
  defaultModel: "deepseek-chat",
  useProxy: false,
  allowCustomModel: true,
  translateBatchConfig: { maxLen: 2000, batchSize: 10, interval: 1100 },
  generateBatchConfig: { maxLen: 2000, batchSize: 10, interval: 1100 }
});

export default deepseekProvider;
