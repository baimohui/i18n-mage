import { aiService } from "@/ai/AiService";
import type { GenerateKeyData } from "@/ai/types";

export { AiService, aiService } from "@/ai/AiService";
export type { GenerateKeyData } from "@/ai/types";

export async function generateKeyFromAi(data: GenerateKeyData, startIndex = 0) {
  return aiService.generateKeyFrom(data, startIndex);
}
