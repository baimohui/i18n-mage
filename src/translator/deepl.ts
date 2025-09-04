import axios, { AxiosError } from "axios";
import { batchTranslate } from "./utils/batchTranslate";
import { TranslateParams, TranslateResult } from "@/types";
import { getConfig } from "@/utils/config";

const freeUrl = "https://api-free.deepl.com/v2/translate";
const proUrl = "https://api.deepl.com/v2/translate";

let deeplApiKey = "";
let url = "";

export default async function translateTo({ source, target, sourceTextList, apiKey }: TranslateParams): Promise<TranslateResult> {
  deeplApiKey = apiKey;
  url = getConfig<string>("translationServices.deeplVersion") === "pro" ? proUrl : freeUrl;
  return batchTranslate(source, target, sourceTextList, { maxLen: 2000, batchSize: 10, interval: 1000 }, send);
}

interface TranslationResponse {
  error_code?: number;
  translations: { detected_source_language; text: string }[];
}

async function send(source: string, target: string, texts: string[]): Promise<TranslateResult> {
  try {
    const params = new URLSearchParams({
      auth_key: deeplApiKey,
      source_lang: source,
      target_lang: target
    });
    // 添加多个文本参数
    texts.forEach(text => params.append("text", text));
    const { data } = await axios.post<TranslationResponse>(url, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    const transformed: string[] = [];
    data.translations.forEach(t => {
      transformed.push(t.text);
    });

    return { success: true, data: transformed };
  } catch (e: unknown) {
    let message = "Unknown error";
    if (e instanceof AxiosError) {
      message = (e.response?.data as { message?: string })?.message ?? e.message;
    } else if (e instanceof Error) {
      message = e.message;
    } else if (typeof e === "string") {
      message = e;
    }

    return { success: false, message };
  }
}
