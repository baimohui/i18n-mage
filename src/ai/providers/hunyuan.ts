import { createOpenAICompatibleProvider } from "@/ai/shared/openaiCompatibleProvider";

const hunyuanProvider = createOpenAICompatibleProvider({
  id: "hunyuan",
  baseUrl: "https://api.hunyuan.cloud.tencent.com/v1/chat/completions",
  defaultModel: "hunyuan-turbos-latest",
  useProxy: true,
  allowCustomModel: true,
  translateBatchConfig: { maxLen: 4000, batchSize: 20, interval: 800 },
  generateBatchConfig: { maxLen: 2000, batchSize: 10, interval: 1100 }
});

export default hunyuanProvider;
