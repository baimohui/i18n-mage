export type ApiPlatform = "deepseek" | "google" | "baidu" | "tencent";

export interface TranslateParams {
  source: string;
  target: string;
  sourceTextList: string[];
  apiId: string;
  apiKey: string;
}

export interface TranslateResult {
  success: boolean;
  langUnsupported?: boolean;
  data?: string[];
  message?: string;
  api?: ApiPlatform;
}
