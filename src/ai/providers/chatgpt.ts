import { createOpenAICompatibleProvider } from "@/ai/shared/openaiCompatibleProvider";

const chatgptProvider = createOpenAICompatibleProvider({
  id: "chatgpt",
  baseUrl: "https://api.openai.com/v1/chat/completions",
  defaultModel: "gpt-4o-mini",
  useProxy: true,
  allowCustomModel: false,
  translateBatchConfig: { maxLen: 4000, batchSize: 20, interval: 800 },
  generateBatchConfig: { maxLen: 2000, batchSize: 10, interval: 1100 }
});

export default chatgptProvider;
