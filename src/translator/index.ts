import { getLangCode } from "@/utils/langKey";
import tcTranslateTo from "./tencent";
import bdTranslateTo from "./baidu";
import ggTranslateTo from "./google";
import gfTranslateTo from "./googleFree";
import dlTranslateTo from "./deepl";
import ydTranslateTo from "./youdao";
import { TranslateParams, TranslateResult, ApiPlatform } from "@/types";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getCacheConfig } from "@/utils/config";
import { ApiCredentialsMap, selectAvailableApiList } from "@/ai/shared/selectAvailableApi";
import { aiService } from "@/ai";

export interface Credentials {
  baiduAppId?: string;
  baiduSecretKey?: string;
  tencentSecretId?: string;
  tencentSecretKey?: string;
  deepseekApiKey?: string;
  translateApiPriority: string[];
}

export interface TranslateData {
  source: string;
  target: string;
  sourceTextList: string[];
}

type ApiMap = ApiCredentialsMap<ApiPlatform>;

export default async function translateTo(data: TranslateData, startIndex = 0): Promise<TranslateResult> {
  const { source = "", target = "", sourceTextList = [] } = data;

  const deeplApiKey = getCacheConfig<string>("translationServices.deeplApiKey");
  const baiduAppId = getCacheConfig<string>("translationServices.baiduAppId");
  const baiduSecretKey = getCacheConfig<string>("translationServices.baiduSecretKey");
  const tencentSecretId = getCacheConfig<string>("translationServices.tencentSecretId");
  const tencentSecretKey = getCacheConfig<string>("translationServices.tencentSecretKey");
  const deepseekApiKey = getCacheConfig<string>("translationServices.deepseekApiKey");
  const openaiApiKey = getCacheConfig<string>("translationServices.openaiApiKey", "");
  const googleApiKey = getCacheConfig<string>("translationServices.googleApiKey");
  const youdaoAppId = getCacheConfig<string>("translationServices.youdaoAppId");
  const youdaoAppKey = getCacheConfig<string>("translationServices.youdaoAppKey");
  const translateApiPriority = getCacheConfig<string[]>("translationServices.translateApiPriority");
  const aiCustomPrompt = getCacheConfig<string>("translationServices.aiCustomPrompt");

  const apiMap: ApiMap = {
    google: googleApiKey ? ["none", googleApiKey] : [],
    baidu: [baiduAppId, baiduSecretKey],
    tencent: [tencentSecretId, tencentSecretKey],
    deepseek: ["none", deepseekApiKey],
    chatgpt: ["none", openaiApiKey],
    deepl: ["none", deeplApiKey],
    youdao: [youdaoAppId, youdaoAppKey]
  };

  const availableApiList = selectAvailableApiList<ApiPlatform>(translateApiPriority, apiMap);

  if (startIndex >= availableApiList.length) {
    const message = t("translator.noAvailableApi");
    NotificationManager.showWarning(message);
    return { success: false, message };
  }

  const availableApi = availableApiList[startIndex];
  const sourceLangCode = getLangCode(source, availableApi);
  const targetLangCode = getLangCode(target, availableApi);

  if (sourceLangCode === null) {
    if (startIndex + 1 < availableApiList.length) {
      const backupApi = availableApiList[startIndex + 1];
      NotificationManager.showProgress({
        message: t("translator.useOtherApi", availableApi, target, t("translator.invalidSourceCode", source), backupApi),
        type: "error"
      });
      return translateTo(data, startIndex + 1);
    }
    NotificationManager.showProgress({
      message: t("translator.failedToFix", availableApi, target, t("translator.invalidSourceCode", source)),
      type: "error"
    });
    return { success: false, message: t("translator.noAvailableApi") };
  }

  if (targetLangCode === null) {
    if (startIndex + 1 < availableApiList.length) {
      const backupApi = availableApiList[startIndex + 1];
      NotificationManager.showProgress({
        message: t("translator.useOtherApi", availableApi, target, t("translator.invalidTargetCode", target), backupApi),
        type: "error"
      });
      return translateTo(data, startIndex + 1);
    }
    NotificationManager.showProgress({
      message: t("translator.failedToFix", availableApi, target, t("translator.invalidTargetCode", target)),
      type: "error"
    });
    return { success: false, message: t("translator.noAvailableApi") };
  }

  const params: TranslateParams = {
    source: sourceLangCode,
    target: targetLangCode,
    sourceTextList,
    apiId: apiMap[availableApi][0] ?? "",
    apiKey: apiMap[availableApi][1] ?? "",
    customPrompt: aiCustomPrompt
  };

  const res = await doTranslate(availableApi, params);
  if (res.success) {
    res.api = availableApi;
    res.message = t(
      "command.fix.progressDetail",
      target,
      availableApi,
      res?.data?.map(item => item.replace(/\n/g, "\\n")).join(", ") ?? ""
    );
    return res;
  }

  if (startIndex + 1 < availableApiList.length) {
    const nextApi = availableApiList[startIndex + 1];
    NotificationManager.showProgress({
      message: t("translator.useOtherApi", availableApi, target, res.message ?? t("common.unknownError"), nextApi),
      type: "error"
    });
    return translateTo(data, startIndex + 1);
  }

  res.message = t("translator.failedToFix", availableApi, target, res.message ?? t("common.unknownError"));
  return { success: false, message: res.message };
}

async function doTranslate(api: ApiPlatform, params: TranslateParams): Promise<TranslateResult> {
  if (aiService.isAiPlatform(api)) {
    return aiService.translate(api, params);
  }

  switch (api) {
    case "tencent":
      return tcTranslateTo(params);
    case "baidu":
      return bdTranslateTo(params);
    case "google":
      return params.apiKey ? ggTranslateTo(params) : gfTranslateTo(params);
    case "deepl":
      return dlTranslateTo(params);
    case "youdao":
      return ydTranslateTo(params);
    default:
      return { success: false, message: t("translator.unknownService") };
  }
}
