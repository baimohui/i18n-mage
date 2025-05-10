import { getLangCode } from "../utils/const";
import { printInfo } from "../utils/print";
import tcTranslateTo from "./tencent";
import bdTranslateTo from "./baidu";
import ggTranslateTo from "./google";
import { TranslateParams, TranslateResult, ApiPlatform } from "../types";

interface Credentials {
  baiduAppId?: string;
  baiduSecretKey?: string;
  tencentSecretId?: string;
  tencentSecretKey?: string;
  translateApiPriority: string[];
}

// interface TranslateParams {
//   source: string;
//   target: string;
//   sourceTextList: string[];
//   credentials: Credentials;
// }

type ApiMap = Record<ApiPlatform, (string | undefined)[]>;

let curApiId = 0;

const translateTo = async ({ source, target, sourceTextList, credentials }): Promise<TranslateResult> => {
  const { baiduAppId, baiduSecretKey, tencentSecretId, tencentSecretKey, translateApiPriority } = credentials as Credentials;
  const apiMap: ApiMap = {
    google: [],
    baidu: [baiduAppId, baiduSecretKey],
    tencent: [tencentSecretId, tencentSecretKey]
  };
  const availableApiList = translateApiPriority.filter(api => apiMap[api] && !apiMap[api].some(token => !token)) as ApiPlatform[];
  let availableApi = availableApiList[curApiId];
  const hasBackupApi = availableApiList.length > curApiId + 1;
  if (!availableApi) {
    return { success: false, message: "未检测到可用的翻译服务，请配置后再尝试此操作！" };
  }

  let res: TranslateResult;
  const sourceLangCode = getLangCode(source, availableApi);
  const targetLangCode = getLangCode(target, availableApi);
  const params:TranslateParams = {
    source: sourceLangCode,
    target: targetLangCode,
    sourceTextList,
    apiId: apiMap[availableApi][0] || "",
    apiKey: apiMap[availableApi][1] || ""
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
    const failedFixInfo = `${availableApi} 修正失败：${res.message}`;
    if (hasBackupApi) {
      availableApi = availableApiList[++curApiId];
      printInfo(failedFixInfo, "error");
      if (res.langUnsupported) {
        printInfo(`将由 ${availableApi} 尝试翻译该语种`, "brain");
      } else {
        printInfo(`将由 ${availableApi} 继续服务...`, "success");
      }
      const newRes = await translateTo({ source, target, sourceTextList, credentials });
      res.langUnsupported && curApiId--;
      return newRes;
    } else {
      return { success: false, message: failedFixInfo };
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
