import { AiPlatform, GenKeyParams, GenKeyResult, KeyStyle, TranslateParams, TranslateResult } from "@/types";

export interface AiProvider {
  id: AiPlatform;
  translate: (params: TranslateParams) => Promise<TranslateResult>;
  generateKey: (params: GenKeyParams) => Promise<GenKeyResult>;
}

export interface GenerateKeyData {
  sourceTextList: string[];
  style: KeyStyle;
  maxLen: number;
}
