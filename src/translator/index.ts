import { getLangCode } from "@/utils/langKey";
import tcTranslateTo from "./tencent";
import bdTranslateTo from "./baidu";
import ggTranslateTo from "./google";
import dsTranslateTo from "./deepseek";
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

let curApiId = 0;

const translateTo = async (data: TranslateData): Promise<TranslateResult> => {
  const { source = "", target = "", sourceTextList = [] } = data;
  const baiduAppId = getConfig<string>("translationServices.baiduAppId", "");
  const baiduSecretKey = getConfig<string>("translationServices.baiduSecretKey", "");
  const tencentSecretId = getConfig<string>("translationServices.tencentSecretId", "");
  const tencentSecretKey = getConfig<string>("translationServices.tencentSecretKey", "");
  const deepseekApiKey = getConfig<string>("translationServices.deepseekApiKey", "");
  const translateApiPriority = getConfig<string[]>("translationServices.translateApiPriority", ["google", "baidu", "tencent"]);
  const apiMap: ApiMap = {
    google: [],
    baidu: [baiduAppId, baiduSecretKey],
    tencent: [tencentSecretId, tencentSecretKey],
    deepseek: ["none", deepseekApiKey]
  };
  const availableApiList = translateApiPriority.filter(
    api => Array.isArray(apiMap[api]) && !apiMap[api].some(token => typeof token !== "string" || token.trim() === "")
  ) as ApiPlatform[];
  let availableApi = availableApiList[curApiId];
  const hasBackupApi = availableApiList.length > curApiId + 1;
  if (!availableApi) {
    const message = t("translator.noAvailableApi");
    NotificationManager.showWarning(message);
    return { success: false, message };
  }

  let res: TranslateResult;
  const sourceLangCode = getLangCode(source, availableApi);
  const targetLangCode = getLangCode(target, availableApi);
  if (sourceLangCode === null) {
    const message = t(`translator.invalidSourceCode`, source, availableApi);
    NotificationManager.showWarning(message);
    return { success: false, message };
  }
  if (targetLangCode === null) {
    const message = t(`translator.invalidTargetCode`, target, availableApi);
    NotificationManager.showWarning(message);
    return { success: false, message };
  }
  const params: TranslateParams = {
    source: sourceLangCode,
    target: targetLangCode,
    sourceTextList,
    apiId: apiMap[availableApi][0] ?? "",
    apiKey: apiMap[availableApi][1] ?? ""
  };
  switch (availableApi) {
    case "tencent":
      res = await tcTranslateTo(params);
      break;
    case "baidu":
      res = await bdTranslateTo(params);
      break;
    case "google":
      res = await ggTranslateTo(params);
      break;
    case "deepseek":
      res = await dsTranslateTo(params);
      break;
    default:
      return { success: false, message: t("translator.unknownService") };
  }
  if (res.success) {
    NotificationManager.showProgress(
      t("command.fix.progressDetail", target, availableApi, res?.data?.map(item => item.replace(/\n/g, "\\n")).join(", ") ?? "")
    );
  } else {
    NotificationManager.showError(t("command.fix.error", `[${availableApi}]${res.message}`));
    if (hasBackupApi) {
      availableApi = availableApiList[++curApiId];
      if (res.langUnsupported === true) {
        NotificationManager.showProgress(t("translator.useOtherApi", availableApi));
      } else {
        NotificationManager.showProgress(t("translator.useApi", availableApi));
      }
      const newRes = await translateTo({ source, target, sourceTextList });
      if (res.langUnsupported === true) {
        curApiId--;
      }
      return newRes;
    } else {
      return { success: false };
    }
  }
  return new Promise(resolve => {
    res.api = availableApi;
    if (availableApi === "google") {
      setTimeout(() => {
        resolve(res);
      }, 1000);
    } else {
      resolve(res);
    }
  });
};

export default translateTo;
