import dsGenKey from "./deepseek";
import cgGenKey from "./chatgpt";
import { GenKeyParams, GenKeyResult, AiPlatform, KeyStyle } from "@/types";
import { t } from "@/utils/i18n";
// import { NotificationManager } from "@/utils/notification";
import { getCacheConfig } from "@/utils/config";

export interface Credentials {
  deepseekApiKey?: string;
  translateApiPriority: string[];
}

export interface TranslateData {
  sourceTextList: string[];
  style: KeyStyle;
  maxLen: number;
}

type ApiMap = Record<AiPlatform, (string | undefined)[]>;

export default async function generateKeyFrom(data: TranslateData, startIndex = 0): Promise<GenKeyResult> {
  const { style, maxLen, sourceTextList = [] } = data;

  const deepseekApiKey = getCacheConfig<string>("translationServices.deepseekApiKey");
  const openaiApiKey = getCacheConfig<string>("translationServices.openaiApiKey", "");
  const translateApiPriority = getCacheConfig<string[]>("translationServices.translateApiPriority");

  const apiMap: ApiMap = {
    deepseek: ["none", deepseekApiKey],
    chatgpt: ["none", openaiApiKey]
  };

  const availableApiList = translateApiPriority.filter(
    api => Array.isArray(apiMap[api]) && !apiMap[api].some(token => typeof token !== "string" || token.trim() === "")
  ) as AiPlatform[];

  if (startIndex >= availableApiList.length) {
    const message = t("translator.noAvailableApi");
    // NotificationManager.showWarning(message);
    return { success: false, message };
  }

  const availableApi = availableApiList[startIndex];

  const params: GenKeyParams = {
    sourceTextList,
    style,
    maxLen,
    apiId: apiMap[availableApi][0] ?? "",
    apiKey: apiMap[availableApi][1] ?? ""
  };

  const res = await genKey(availableApi, params);

  if (res.success) {
    res.api = availableApi;
    res.message = "";
    return res;
  } else {
    if (startIndex + 1 < availableApiList.length) {
      // const nextApi = availableApiList[startIndex + 1];
      return generateKeyFrom(data, startIndex + 1);
    }
    res.message = "Failed to generate keys";
    return { success: false, message: res.message };
  }
}

async function genKey(api: AiPlatform, params: GenKeyParams): Promise<GenKeyResult> {
  switch (api) {
    case "deepseek":
      return dsGenKey(params);
    case "chatgpt":
      return cgGenKey(params);
    default:
      return { success: false, message: t("translator.unknownService") };
  }
}
