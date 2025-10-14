import { getLangCode } from "@/utils/langKey";
import tcTranslateTo from "./tencent";
import bdTranslateTo from "./baidu";
import ggTranslateTo from "./google";
import gfTranslateTo from "./googleFree";
import dsTranslateTo from "./deepseek";
import dlTranslateTo from "./deepl";
import cgTranslateTo from "./chatgpt";
import { TranslateParams, TranslateResult, ApiPlatform } from "@/types";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";

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

type ApiMap = Record<ApiPlatform, (string | undefined)[]>;

export default async function translateTo(data: TranslateData, startIndex = 0): Promise<TranslateResult> {
  const { source = "", target = "", sourceTextList = [] } = data;

  const deeplApiKey = getConfig<string>("translationServices.deeplApiKey", "");
  const baiduAppId = getConfig<string>("translationServices.baiduAppId", "");
  const baiduSecretKey = getConfig<string>("translationServices.baiduSecretKey", "");
  const tencentSecretId = getConfig<string>("translationServices.tencentSecretId", "");
  const tencentSecretKey = getConfig<string>("translationServices.tencentSecretKey", "");
  const deepseekApiKey = getConfig<string>("translationServices.deepseekApiKey", "");
  const chatgptApiKey = getConfig<string>("translationServices.chatgptApiKey", "");
  const googleApiKey = getConfig<string>("translationServices.googleApiKey", "");
  const translateApiPriority = getConfig<string[]>("translationServices.translateApiPriority", []);

  const apiMap: ApiMap = {
    google: googleApiKey ? ["none", googleApiKey] : [],
    baidu: [baiduAppId, baiduSecretKey],
    tencent: [tencentSecretId, tencentSecretKey],
    deepseek: ["none", deepseekApiKey],
    chatgpt: ["none", chatgptApiKey],
    deepl: ["none", deeplApiKey]
  };

  const availableApiList = translateApiPriority.filter(
    api => Array.isArray(apiMap[api]) && !apiMap[api].some(token => typeof token !== "string" || token.trim() === "")
  ) as ApiPlatform[];

  if (startIndex >= availableApiList.length) {
    const message = t("translator.noAvailableApi");
    NotificationManager.showWarning(message);
    return { success: false, message };
  }

  const availableApi = availableApiList[startIndex];
  const sourceLangCode = getLangCode(source, availableApi);
  const targetLangCode = getLangCode(target, availableApi);

  // 源语言不支持 → 直接换下一个
  if (sourceLangCode === null) {
    if (startIndex + 1 < availableApiList.length) {
      const backupApi = availableApiList[startIndex + 1];
      NotificationManager.showProgress({
        message: t("translator.useOtherApi", availableApi, target, t("translator.invalidSourceCode", source), backupApi),
        type: "error"
      });
      const res = await translateTo(data, startIndex + 1);
      return res;
    }
    NotificationManager.showProgress({
      message: t("translator.failedToFix", availableApi, target, t("translator.invalidSourceCode", source)),
      type: "error"
    });
    return { success: false, message: t("translator.noAvailableApi") };
  }

  // 目标语言不支持 → 尝试临时接力
  if (targetLangCode === null) {
    if (startIndex + 1 < availableApiList.length) {
      const backupApi = availableApiList[startIndex + 1];
      NotificationManager.showProgress({
        message: t("translator.useOtherApi", availableApi, target, t("translator.invalidTargetCode", target), backupApi),
        type: "error"
      });
      const res = await translateTo(data, startIndex + 1);
      return res;
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
    apiKey: apiMap[availableApi][1] ?? ""
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
  } else {
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
}

async function doTranslate(api: ApiPlatform, params: TranslateParams): Promise<TranslateResult> {
  switch (api) {
    case "tencent":
      return tcTranslateTo(params);
    case "baidu":
      return bdTranslateTo(params);
    case "google":
      return params.apiKey ? ggTranslateTo(params) : gfTranslateTo(params);
    case "deepseek":
      return dsTranslateTo(params);
    case "deepl":
      return dlTranslateTo(params);
    case "chatgpt":
      return cgTranslateTo(params);
    default:
      return { success: false, message: t("translator.unknownService") };
  }
}
