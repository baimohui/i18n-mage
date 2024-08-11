// const fs = require("fs");
// const { baiduAppId, baiduSecretKey, tencentSecretId, tencentSecretKey, translateApiPriority, cachePath } = require("../config.js");
const { getLangCode } = require("../utils/const");
const { printInfo } = require("../utils/print");
const tcTranslateTo = require("./tencent");
const bdTranslateTo = require("./baidu");
const ggTranslateTo = require("./google");

let curApiId = 0;

const translateTo = async ({ source, target, sourceTextList, credentials }) => {
  const { baiduAppId, baiduSecretKey, tencentSecretId, tencentSecretKey, translateApiPriority } = credentials;
  const apiMap = {
    google: [],
    baidu: [baiduAppId, baiduSecretKey],
    tencent: [tencentSecretId, tencentSecretKey]
  };
  const availableApiList = translateApiPriority.filter(api => apiMap[api] && !apiMap[api].some(token => !token));
  let availableApi = availableApiList[curApiId];
  // let errorMessage = "";
  const hasBackupApi = availableApiList.length > curApiId + 1;
  if (!availableApi) {
    return { success: false, message: "未检测到可用的翻译服务，请配置后再尝试此操作！" };
  }
  // const [availableWords, cacheObj] = getAvailableWords(availableApi);
  // const consumption = sourceTextList.reduce((prev, cur) => prev + cur.length, 0);
  // if (consumption > availableWords && availableApi !== "google") {
  //   errorMessage = `${availableApi} 本月免费翻译额度已用完！`;
  //   if (hasBackupApi) {
  //     availableApi = availableApiList[++curApiId];
  //     printInfo(errorMessage, "error");
  //     printInfo(`将由 ${availableApi} 继续为您服务...`, "success");
  //   } else {
  //     return { success: false, message: errorMessage };
  //   }
  // }
  let res;
  const sourceLangCode = getLangCode(source, availableApi);
  const targetLangCode = getLangCode(target, availableApi);
  const params = { source: sourceLangCode, target: targetLangCode, sourceTextList };
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
  }
  if (res.success) {
    // availableApi !== "google" && setAvailableWords(availableApi, cacheObj, consumption);
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

// const getAvailableWords = api => {
//   let cacheObj = {};
//   let availableWords = 0;
//   if (fs.existsSync(cachePath)) {
//     const cache = fs.readFileSync(cachePath, "utf8");
//     cacheObj = JSON.parse(cache) || {};
//   }
//   const baiduWordsMonthLimit = 1_000_000;
//   const tencentWordsMonthLimit = 5_000_000;
//   const currentTimeStamp = Date.now();
//   const getMonth = timestamp => new Date(timestamp).getMonth();
//   switch (api) {
//     case "baidu":
//       cacheObj.remainAvailableWordsInBaidu ??= baiduWordsMonthLimit;
//       cacheObj.initMonthTimestampInBaidu ??= currentTimeStamp;
//       if (getMonth(currentTimeStamp) !== getMonth(cacheObj.initMonthTimestampInBaidu)) {
//         cacheObj.initMonthTimestampInBaidu = currentTimeStamp;
//         cacheObj.remainAvailableWordsInBaidu = baiduWordsMonthLimit;
//       }
//       availableWords = cacheObj.remainAvailableWordsInBaidu;
//       break;
//     case "tencent":
//       cacheObj.remainAvailableWordsInTencent ??= tencentWordsMonthLimit;
//       cacheObj.initMonthTimestampInTencent ??= currentTimeStamp;
//       if (getMonth(currentTimeStamp) !== getMonth(cacheObj.initMonthTimestampInTencent)) {
//         cacheObj.initMonthTimestampInTencent = currentTimeStamp;
//         cacheObj.remainAvailableWordsInTencent = tencentWordsMonthLimit;
//       }
//       availableWords = cacheObj.remainAvailableWordsInTencent;
//       break;
//   }
//   return [availableWords, cacheObj];
// };

// const setAvailableWords = (api, cacheObj, consumption) => {
//   if (api === "baidu") {
//     cacheObj.remainAvailableWordsInBaidu -= consumption;
//   } else if (api === "tencent") {
//     cacheObj.remainAvailableWordsInTencent -= consumption;
//   }
//   fs.writeFileSync(cachePath, JSON.stringify(cacheObj));
// };

module.exports = translateTo;
