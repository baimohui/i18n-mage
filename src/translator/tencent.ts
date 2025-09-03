import { tmt } from "tencentcloud-sdk-nodejs-tmt";
import { TranslateParams, TranslateResult } from "../types";
import { t } from "@/utils/i18n";
import { batchTranslate } from "./utils/batchTranslate";

const TmtClient = tmt.v20180321.Client;

let tencentSecretId = "";
let tencentSecretKey = "";

const supportLangMap: Record<string, string[]> = {
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

export default async function translateTo({ source, target, sourceTextList, apiId, apiKey }: TranslateParams): Promise<TranslateResult> {
  if (!Object.hasOwn(supportLangMap, source)) {
    return {
      success: false,
      message: t(`translator.tencentError.unsupportedLanguage`, source)
    };
  }
  if (!supportLangMap[source]?.includes(target)) {
    return {
      success: false,
      message: t(`translator.tencentError.unsupportedLanguageMap`, source, target)
    };
  }
  tencentSecretId = apiId;
  tencentSecretKey = apiKey;
  return batchTranslate(source, target, sourceTextList, { maxLen: 2000, batchSize: 5, interval: 1100 }, send);
}

function send(source: string, target: string, sourceTextList: string[]): Promise<TranslateResult> {
  return new Promise(resolve => {
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
        resolve({ success: true, data: data.TargetTextList || [] });
      },
      (e: unknown) => {
        resolve({ success: false, message: e instanceof Error ? e.message : (e as string) });
      }
    );
  });
}
