import md5 from "js-md5";
import axios from "axios";
import { t } from "@/utils/i18n";
import { batchTranslate } from "./utils/batchTranslate";
import { TranslateParams, TranslateResult } from "@/types";

const baseUrl = "https://fanyi-api.baidu.com/api/trans/vip/translate";

const errorCodeMap: Record<number, string> = {
  52001: t("translator.baiduErrorInfo.requestTimeout"),
  52002: t("translator.baiduErrorInfo.systemError"),
  52003: t("translator.baiduErrorInfo.unauthorizedUser"),
  54000: t("translator.baiduErrorInfo.paramsRequired"),
  54001: t("translator.baiduErrorInfo.signatureError"),
  54003: t("translator.baiduErrorInfo.limitedCallFrequency"),
  54004: t("translator.baiduErrorInfo.insufficientBalance"),
  54005: t("translator.baiduErrorInfo.longQueryFrequency"),
  58000: t("translator.baiduErrorInfo.wrongIp"),
  58001: t("translator.baiduErrorInfo.unsupportedLanguage"),
  58002: t("translator.baiduErrorInfo.closedService"),
  90107: t("translator.baiduErrorInfo.failedCertification")
};

let baiduAppId = "";
let baiduSecretKey = "";

export default async function translateTo({ source, target, sourceTextList, apiId, apiKey }: TranslateParams): Promise<TranslateResult> {
  baiduAppId = apiId;
  baiduSecretKey = apiKey;
  return batchTranslate(source, target, sourceTextList, { maxLen: 2000, batchSize: 10, interval: 1000 }, send);
}

interface TranslationResponse {
  error_code?: number;
  trans_result: Array<{ dst: string }>;
}

async function send(source: string, target: string, texts: string[]): Promise<TranslateResult> {
  try {
    const salt = Math.random();
    const sourceText = texts.join("\n");
    const params = {
      from: source,
      to: target,
      appid: baiduAppId,
      salt,
      sign: String((md5 as (input: string) => string)(baiduAppId + sourceText + salt + baiduSecretKey)),
      q: encodeURIComponent(sourceText)
    };
    const requestUrl = createUrl(baseUrl, params);
    const { data } = await axios.get<TranslationResponse>(requestUrl);

    if (data.error_code != null) {
      return { success: false, message: `${errorCodeMap[data.error_code]}[${data.error_code}]` };
    }

    // 还原按行拆分
    const resList = data.trans_result.map((item: { dst: string }) => item.dst);
    const transformed: string[] = [];
    let curIndex = 0;
    texts.forEach(text => {
      const lineCount = (text.match(/\n/g) || []).length + 1;
      transformed.push(resList.slice(curIndex, curIndex + lineCount).join("\n"));
      curIndex += lineCount;
    });

    return { success: true, data: transformed };
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : (e as string) };
  }
}

function createUrl(domain: string, form: Record<string, string | number>): string {
  let result = domain + "?";
  for (const key in form) {
    result += `${key}=${form[key]}&`;
  }
  return result.slice(0, -1);
}
