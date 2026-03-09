import {
  AiPlatform,
  ApiPlatform,
  GenKeyParams,
  GenKeyResult,
  SelectPrefixParams,
  SelectPrefixResult,
  TranslateParams,
  TranslateResult
} from "@/types";
import { getCacheConfig } from "@/utils/config";
import { t } from "@/utils/i18n";
import { ApiCredentialsMap, selectAvailableApiList } from "@/ai/shared/selectAvailableApi";
import { AiProvider, GenerateKeyData, SelectPrefixData } from "@/ai/types";
import deepseekProvider from "@/ai/providers/deepseek";
import chatgptProvider from "@/ai/providers/chatgpt";
import doubaoProvider from "@/ai/providers/doubao";
import qwenProvider from "@/ai/providers/qwen";
import hunyuanProvider from "@/ai/providers/hunyuan";
import kimiProvider from "@/ai/providers/kimi";

type AiApiMap = ApiCredentialsMap<AiPlatform>;

export class AiService {
  private providers: Record<AiPlatform, AiProvider>;

  constructor(providers: AiProvider[]) {
    this.providers = providers.reduce(
      (prev, provider) => {
        prev[provider.id] = provider;
        return prev;
      },
      {} as Record<AiPlatform, AiProvider>
    );
  }

  public isAiPlatform(api: ApiPlatform): api is AiPlatform {
    return api in this.providers;
  }

  public hasAvailableProviders(): boolean {
    return this.getAvailableProviders().length > 0;
  }

  public async translate(api: AiPlatform, params: TranslateParams): Promise<TranslateResult> {
    const provider = this.providers[api];
    if (provider === undefined) {
      return { success: false, message: t("translator.unknownService") };
    }
    return provider.translate(params);
  }

  public async generateKeyFrom(data: GenerateKeyData, startIndex = 0): Promise<GenKeyResult> {
    const { sourceTextList = [], style, maxLen } = data;
    const availableProviders = this.getAvailableProviders();

    if (startIndex >= availableProviders.length) {
      return { success: false, message: t("translator.noAvailableApi") };
    }

    const providerId = availableProviders[startIndex];
    const credentialsMap = this.getCredentialsMap();
    const params: GenKeyParams = {
      sourceTextList,
      style,
      maxLen,
      apiId: credentialsMap[providerId][0] ?? "",
      apiKey: credentialsMap[providerId][1] ?? ""
    };

    const result = await this.providers[providerId].generateKey(params);
    if (result.success) {
      result.api = providerId;
      result.message = "";
      return result;
    }

    if (startIndex + 1 < availableProviders.length) {
      return this.generateKeyFrom(data, startIndex + 1);
    }

    result.message = "Failed to generate keys";
    return { success: false, message: result.message };
  }

  public async selectPrefixFrom(data: SelectPrefixData, startIndex = 0): Promise<SelectPrefixResult> {
    const { sourceTextList = [], prefixCandidates = [] } = data;
    const availableProviders = this.getAvailableProviders();

    if (startIndex >= availableProviders.length) {
      return { success: false, message: t("translator.noAvailableApi") };
    }

    const providerId = availableProviders[startIndex];
    const credentialsMap = this.getCredentialsMap();
    const params: SelectPrefixParams = {
      sourceTextList,
      prefixCandidates,
      apiId: credentialsMap[providerId][0] ?? "",
      apiKey: credentialsMap[providerId][1] ?? ""
    };

    const result = await this.providers[providerId].selectPrefix(params);
    if (result.success) {
      result.api = providerId;
      result.message = "";
      return result;
    }

    if (startIndex + 1 < availableProviders.length) {
      return this.selectPrefixFrom(data, startIndex + 1);
    }

    result.message = "Failed to select prefixes";
    return { success: false, message: result.message };
  }

  private getCredentialsMap(): AiApiMap {
    const deepseekApiKey = getCacheConfig<string>("translationServices.deepseekApiKey", "");
    const deepseekModel = getCacheConfig<string>("translationServices.deepseekModel", "deepseek-chat");
    const openaiApiKey = getCacheConfig<string>("translationServices.openaiApiKey", "");
    const openaiModel = getCacheConfig<string>("translationServices.openaiModel", "gpt-4o-mini");
    const doubaoApiKey = getCacheConfig<string>("translationServices.doubaoApiKey", "");
    const doubaoModel = getCacheConfig<string>("translationServices.doubaoModel", "");
    const qwenApiKey = getCacheConfig<string>("translationServices.qwenApiKey", "");
    const qwenModel = getCacheConfig<string>("translationServices.qwenModel", "");
    const hunyuanApiKey = getCacheConfig<string>("translationServices.hunyuanApiKey", "");
    const hunyuanModel = getCacheConfig<string>("translationServices.hunyuanModel", "");
    const kimiApiKey = getCacheConfig<string>("translationServices.kimiApiKey", "");
    const kimiModel = getCacheConfig<string>("translationServices.kimiModel", "");

    return {
      deepseek: [deepseekModel, deepseekApiKey],
      chatgpt: [openaiModel, openaiApiKey],
      doubao: [doubaoModel, doubaoApiKey],
      qwen: [qwenModel, qwenApiKey],
      hunyuan: [hunyuanModel, hunyuanApiKey],
      kimi: [kimiModel, kimiApiKey]
    };
  }

  private getAvailableProviders(): AiPlatform[] {
    const translateApiPriority = getCacheConfig<string[]>("translationServices.translateApiPriority");
    return selectAvailableApiList<AiPlatform>(translateApiPriority, this.getCredentialsMap());
  }
}

export const aiService = new AiService([deepseekProvider, chatgptProvider, doubaoProvider, qwenProvider, hunyuanProvider, kimiProvider]);
