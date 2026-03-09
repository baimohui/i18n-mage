import { CustomAiPlatform } from "./keyGenerator";

export type BuiltinApiPlatform =
  | "deepseek"
  | "google"
  | "baidu"
  | "tencent"
  | "deepl"
  | "chatgpt"
  | "doubao"
  | "qwen"
  | "hunyuan"
  | "kimi"
  | "youdao";

export type ApiPlatform = BuiltinApiPlatform | CustomAiPlatform;

export interface TranslateParams {
  source: string;
  target: string;
  sourceTextList: string[];
  apiId: string;
  apiKey: string;
  customPrompt?: string;
}

export interface TranslateResult {
  success: boolean;
  data?: string[];
  message?: string;
  api?: ApiPlatform;
}
