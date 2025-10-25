import { KeyStyle } from "./config";

export type AiPlatform = "deepseek" | "chatgpt";

export interface GenKeyParams {
  sourceTextList: string[];
  style: KeyStyle;
  maxLen: number;
  apiId: string;
  apiKey: string;
}

export interface GenKeyResult {
  success: boolean;
  data?: string[];
  message?: string;
  api?: AiPlatform;
}
