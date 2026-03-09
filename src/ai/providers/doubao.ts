import { createOpenAICompatibleProvider } from "@/ai/shared/openaiCompatibleProvider";

const doubaoProvider = createOpenAICompatibleProvider({
  id: "doubao",
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
  defaultModel: "doubao-seed-1-8-251228",
  useProxy: true,
  allowCustomModel: true,
  translateBatchConfig: { maxLen: 4000, batchSize: 20, interval: 800 },
  generateBatchConfig: { maxLen: 2000, batchSize: 10, interval: 1100 }
});

export default doubaoProvider;
