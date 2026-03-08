import { aiService } from "@/ai/AiService";
import type { GenerateKeyData, SelectPrefixData } from "@/ai/types";

export { AiService, aiService } from "@/ai/AiService";
export type { GenerateKeyData, SelectPrefixData } from "@/ai/types";

export async function generateKeyFromAi(data: GenerateKeyData, startIndex = 0) {
  return aiService.generateKeyFrom(data, startIndex);
}

export async function selectPrefixFromAi(data: SelectPrefixData, startIndex = 0) {
  return aiService.selectPrefixFrom(data, startIndex);
}

export function isAiServiceAvailable() {
  return aiService.hasAvailableProviders();
}
