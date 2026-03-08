import {
  AiPlatform,
  GenKeyParams,
  GenKeyResult,
  SelectPrefixParams,
  SelectPrefixResult,
  KeyStyle,
  TranslateParams,
  TranslateResult
} from "@/types";

export interface AiProvider {
  id: AiPlatform;
  translate: (params: TranslateParams) => Promise<TranslateResult>;
  generateKey: (params: GenKeyParams) => Promise<GenKeyResult>;
  selectPrefix: (params: SelectPrefixParams) => Promise<SelectPrefixResult>;
}

export interface GenerateKeyData {
  sourceTextList: string[];
  style: KeyStyle;
  maxLen: number;
}

export interface SelectPrefixData {
  sourceTextList: string[];
  prefixCandidates: string[];
}
