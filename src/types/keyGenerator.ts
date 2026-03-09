import { KeyStyle } from "./config";

export type AiPlatform = "deepseek" | "chatgpt" | "doubao" | "qwen";

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

export interface SelectPrefixParams {
  sourceTextList: string[];
  prefixCandidates: string[];
  apiId: string;
  apiKey: string;
}

export interface SelectPrefixResult {
  success: boolean;
  data?: string[];
  message?: string;
  api?: AiPlatform;
}
