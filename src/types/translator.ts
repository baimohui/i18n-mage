export type ApiPlatform = "deepseek" | "google" | "baidu" | "tencent" | "deepl" | "chatgpt" | "youdao";

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
