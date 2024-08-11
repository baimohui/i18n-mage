const md5 = require("js-md5");
const axios = require("axios");
const { baiduAppId, baiduSecretKey } = require("../config.js");

const baseUrl = "https://fanyi-api.baidu.com/api/trans/vip/translate";

const errorCodeMap = {
  52001: "请求超时，请重试",
  52002: "系统错误，请重试",
  52003: "未授权用户，请检查 appid 是否正确或者服务是否开通",
  54000: "必填参数为空，请检查是否少传参数",
  54001: "签名错误，请检查您的签名生成方法",
  54003: "访问频率受限，请降低您的调用频率，或进行身份认证后切换为高级版/尊享版",
  54004: "账户余额不足，请前往管理控制台为账户充值",
  54005: "长 query 请求频繁，请降低长 query 的发送频率，3s 后再试",
  58000: "客户端 IP 非法，请检查个人资料里填写的 IP 地址是否正确，可前往开发者信息 - 基本信息修改",
  58001: "译文语言方向不支持，请检查译文语言是否在语言列表里",
  58002: "服务当前已关闭，请前往管理控制台开启服务",
  90107: "认证未通过或未生效，请前往查看认证进度"
};

const langList0 = ["zh", "en", "yue", "wyw", "jp", "kor", "fra", "spa", "th", "ara", "ru", "pt", "de", "it"];
const langList1 = ["el", "nl", "pl", "bul", "est", "dan", "fin", "cs", "rom", "slo", "swe", "hu", "cht", "vie"];
const supportLangList = langList0.concat(langList1);

const translateTo = async ({ source, target, sourceTextList }) => {
  const translateLenLimit = 2000; // a request content max length
  const secondRequestLimit = 10; // the max times per second to request
  let sum = 0;
  let pack = [];
  const packList = [];
  const unsupportedLang = [source, target].find(item => !supportLangList.includes(item));
  if (unsupportedLang) {
    return {
      success: false,
      langUnsupported: true,
      message: `${unsupportedLang} 不在常见语种列表内。对于非常见语种，仅企业已认证的尊享版用户可调用`
    };
  }
  sourceTextList.forEach(text => {
    sum += text.length;
    if (text.length > translateLenLimit) {
      throw `文本字符数超出单次翻译请求限制：${text}`;
    }
    if (sum > translateLenLimit) {
      packList.push(pack);
      pack = [];
      sum = text.length;
    }
    pack.push(text);
  });
  packList.push(pack);
  return await sendBatch(source, target, packList, 0, secondRequestLimit);
};

const sendBatch = async (source, target, packList, batchNum, batchSize) => {
  const result = { success: true, message: "", data: [] };
  const packNum = batchNum * batchSize;
  for (let i = packNum; i < packNum + batchSize; i++) {
    if (packList[i] === undefined) {
      break;
    }
    const res = await send(source, target, packList[i]);
    if (!res.success) {
      return res;
    }
    result.data.push(...res.data);
  }
  if (packList.length > packNum + batchSize) {
    return new Promise(resolve => {
      setTimeout(async () => {
        const batchRes = await sendBatch(source, target, packList, batchNum + 1, batchSize);
        if (batchRes.success) {
          result.data.push(...batchRes.data);
          resolve(result);
        } else {
          resolve(batchRes)
        }
      }, 1100);
    });
  } else {
    return result;
  }
};

const send = async (source, target, sourceTextList) => {
  try {
    const salt = Math.random();
    const sourceText = sourceTextList.join("\n");
    const params = {
      from: source,
      to: target,
      appid: baiduAppId,
      salt,
      sign: md5(baiduAppId + sourceText + salt + baiduSecretKey),
      q: encodeURIComponent(sourceText)
    };
    const requestUrl = createUrl(baseUrl, params);
    const { data } = await axios.get(requestUrl);
    if (data.error_code) {
      return { success: false, langUnsupported: data.error_code == 58001, message: `${errorCodeMap[data.error_code]}[${data.error_code}]` };
    } else {
      const transformedList = [];
      const resList = data.trans_result.map(item => item.dst);
      let curResIndex = 0;
      sourceTextList.forEach(text => {
        const newlineCount = (text.match(/\n/g) || []).length + 1;
        transformedList.push(resList.slice(curResIndex, curResIndex + newlineCount).join("\n"));
        curResIndex += newlineCount;
      });
      return { success: true, data: transformedList };
    }
  } catch (e) {
    return { success: false, message: e.message };
  }
};

const createUrl = (domain, form) => {
  let result = domain + "?";
  for (let key in form) {
    result += `${key}=${form[key]}&`;
  }
  return result.slice(0, -1);
};

module.exports = translateTo;
