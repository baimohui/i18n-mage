import { getLangCode } from "@/utils/langKey";
import tcTranslateTo from "./tencent";
import bdTranslateTo from "./baidu";
import ggTranslateTo from "./google";
import { TranslateParams, TranslateResult, ApiPlatform } from "@/types";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

export interface Credentials {
  baiduAppId?: string;
  baiduSecretKey?: string;
  tencentSecretId?: string;
  tencentSecretKey?: string;
  translateApiPriority: string[];
}

export interface TranslateData {
  source: string;
  target: string;
  sourceTextList: string[];
  credentials: Credentials;
}

type ApiMap = Record<ApiPlatform, (string | undefined)[]>;

let curApiId = 0;

const translateTo = async (data: TranslateData): Promise<TranslateResult> => {
  const { source = "", target = "", sourceTextList = [], credentials } = data;
  const { baiduAppId, baiduSecretKey, tencentSecretId, tencentSecretKey, translateApiPriority } = credentials;
  const apiMap: ApiMap = {
    google: [],
    baidu: [baiduAppId, baiduSecretKey],
    tencent: [tencentSecretId, tencentSecretKey]
  };
  const availableApiList = translateApiPriority.filter(
    api => Array.isArray(apiMap[api]) && !apiMap[api].some(token => typeof token !== "string" || token.trim() === "")
  ) as ApiPlatform[];
  let availableApi = availableApiList[curApiId];
  const hasBackupApi = availableApiList.length > curApiId + 1;
  if (!availableApi) {
    return { success: false, message: "未检测到可用的翻译服务，请配置后再尝试此操作！" };
  }

  let res: TranslateResult;
  const sourceLangCode = getLangCode(source, availableApi);
  const targetLangCode = getLangCode(target, availableApi);
  if (sourceLangCode === null) {
    return { success: false, message: `源语言 ${source} 不支持 ${availableApi} 翻译` };
  }
  if (targetLangCode === null) {
    return { success: false, message: `目标语言 ${target} 不支持 ${availableApi} 翻译` };
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
    default:
      return { success: false, message: "未知的翻译服务！" };
  }
  if (res.success) {
    // Handle success case
  } else {
    NotificationManager.showError(t("command.fix.error", `[${availableApi}]${res.message}`));
    if (hasBackupApi) {
      availableApi = availableApiList[++curApiId];
      if (res.langUnsupported === true) {
        NotificationManager.showProgress(t("translator.useOtherApi", availableApi));
      } else {
        NotificationManager.showProgress(t("translator.useApi", availableApi));
      }
      const newRes = await translateTo({ source, target, sourceTextList, credentials });
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
