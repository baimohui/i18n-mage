export type ApiPlatform = "deepseek" | "google" | "baidu" | "tencent" | "deepl" | "chatgpt";

export interface TranslateParams {
  source: string;
  target: string;
  sourceTextList: string[];
  apiId: string;
  apiKey: string;
}

export interface TranslateResult {
  success: boolean;
  data?: string[];
  message?: string;
  api?: ApiPlatform;
}
