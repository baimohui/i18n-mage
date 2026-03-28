import { KeyStyle } from "./config";

export type BuiltinAiPlatform = "deepseek" | "chatgpt" | "doubao" | "qwen" | "hunyuan" | "kimi";
export type CustomAiPlatform = `custom:${string}`;
export type AiPlatform = BuiltinAiPlatform | CustomAiPlatform;

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
  sourceFilePathList?: string[][];
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
