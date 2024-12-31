// const fs = require("fs");
// const { globalSetting } = require("../common/collect");
// const { translate: globalSettingTranslate } = globalSetting;
// const { secretId, secretKey, region, endpoint, source, projectId } = globalSettingTranslate || {};
// const { createFile } = require("../common/utils");

const tencentCloud = require("tencentcloud-sdk-nodejs-tmt");
const TmtClient = tencentCloud.tmt.v20180321.Client;

let tencentSecretId = "",
  tencentSecretKey = "";

const supportLangMap = {
  zh: ["en", "ja", "ko", "fr", "es", "it", "de", "tr", "ru", "pt", "vi", "id", "th", "ms"],
  en: ["zh", "zh-TW", "ja", "ko", "fr", "es", "it", "de", "tr", "ru", "pt", "vi", "id", "th", "ms", "ar", "hi"],
  ja: ["zh", "zh-TW", "en", "ko"],
  ko: ["zh", "zh-TW", "en", "ja"],
  fr: ["zh", "zh-TW", "en", "es", "it", "de", "tr", "ru", "pt"],
  es: ["zh", "zh-TW", "en", "fr", "it", "de", "tr", "ru", "pt"],
  it: ["zh", "zh-TW", "en", "fr", "es", "de", "tr", "ru", "pt"],
  de: ["zh", "zh-TW", "en", "fr", "es", "it", "de", "ru", "pt"],
  tr: ["zh", "zh-TW", "en", "fr", "es", "it", "de", "ru", "pt"],
  ru: ["zh", "zh-TW", "en", "fr", "es", "it", "de", "tr", "pt"],
  pt: ["zh", "zh-TW", "en", "fr", "es", "it", "de", "tr", "ru"],
  vi: ["zh", "zh-TW", "en"],
  id: ["zh", "zh-TW", "en"],
  th: ["zh", "zh-TW", "en"],
  ms: ["zh", "zh-TW", "en"],
  ar: ["en"],
  hi: ["en"],
  "zh-TW": ["en", "ja", "ko", "fr", "es", "it", "de", "tr", "ru", "pt", "vi", "id", "th", "ms"]
};

const translateTo = async ({ source, target, sourceTextList, apiId, apiKey }) => {
  if (supportLangMap[source] === "undefined") {
    return {
      success: false,
      langUnsupported: true,
      message: `暂不支持 ${source} 语种`
    };
  }
  if (!supportLangMap[source]?.includes(target)) {
    return {
      success: false,
      langUnsupported: true,
      message: `${source} 支持的目标语言不包含 ${target}，无法翻译！`
    };
  }
  tencentSecretId = apiId;
  tencentSecretKey = apiKey;
  const translateLenLimit = 2000; // a request content max length
  const secondRequestLimit = 5; // the max times per second to request
  let sum = 0;
  let pack = [];
  let packList = [];
  for (let i = 0; i < sourceTextList.length; i++) {
    const text = sourceTextList[i];
    sum += text.length;
    if (text.length > translateLenLimit) {
      return {
        success: false,
        message: `文本字符数超出单次翻译请求限制：${text}`
      };
    }
    if (sum > translateLenLimit) {
      packList.push(pack);
      pack = [];
      sum = text.length;
    }
    pack.push(text);
  }
  packList.push(pack);
  return await sendBatch(source, target, packList, 0, secondRequestLimit);
};

const sendBatch = async (source, target, packList, batchNum, batchSize) => {
  const result = [];
  const packNum = batchNum * batchSize;
  try {
    for (let i = packNum; i < packNum + batchSize; i++) {
      if (packList[i] === undefined) {
        break;
      }
      const res = await send(source, target, packList[i]);
      result.push(...res);
    }
    if (packList.length > packNum + batchSize) {
      return new Promise(resolve => {
        setTimeout(async () => {
          const batchRes = await sendBatch(source, target, packList, batchNum + 1, batchSize);
          result.push(...batchRes);
          resolve({ success: true, data: result });
        }, 1100);
      });
    } else {
      return { success: true, data: result };
    }
  } catch (e) {
    return {
      success: false,
      message: e.message
    };
  }
};

const send = (source, target, sourceTextList) => {
  return new Promise((resolve, reject) => {
    const params = {
      Source: source,
      Target: target,
      ProjectId: 0,
      SourceTextList: sourceTextList
    };
    const client = new TmtClient({
      credential: {
        secretId: tencentSecretId,
        secretKey: tencentSecretKey
      },
      region: "ap-guangzhou",
      profile: {
        httpProfile: {
          endpoint: "tmt.tencentcloudapi.com"
        }
      }
    });
    client.TextTranslateBatch(params).then(
      data => {
        resolve(data.TargetTextList);
      },
      err => {
        reject(err);
      }
    );
  });
};

module.exports = translateTo;
