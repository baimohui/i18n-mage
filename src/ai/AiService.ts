import { AiPlatform, ApiPlatform, GenKeyParams, GenKeyResult, TranslateParams, TranslateResult } from "@/types";
import { getCacheConfig } from "@/utils/config";
import { t } from "@/utils/i18n";
import { ApiCredentialsMap, selectAvailableApiList } from "@/ai/shared/selectAvailableApi";
import { AiProvider, GenerateKeyData } from "@/ai/types";
import deepseekProvider from "@/ai/providers/deepseek";
import chatgptProvider from "@/ai/providers/chatgpt";

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

  private getCredentialsMap(): AiApiMap {
    const deepseekApiKey = getCacheConfig<string>("translationServices.deepseekApiKey");
    const openaiApiKey = getCacheConfig<string>("translationServices.openaiApiKey", "");

    return {
      deepseek: ["none", deepseekApiKey],
      chatgpt: ["none", openaiApiKey]
    };
  }

  private getAvailableProviders(): AiPlatform[] {
    const translateApiPriority = getCacheConfig<string[]>("translationServices.translateApiPriority");
    return selectAvailableApiList<AiPlatform>(translateApiPriority, this.getCredentialsMap());
  }
}

export const aiService = new AiService([deepseekProvider, chatgptProvider]);
