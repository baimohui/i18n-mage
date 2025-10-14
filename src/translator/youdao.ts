import axios from "axios";
import crypto from "crypto";
import { TranslateParams, TranslateResult } from "../types";
import { batchTranslate } from "./utils/batchTranslate";
import { t } from "@/utils/i18n";

const baseUrl = "https://openapi.youdao.com/api";

let youdaoAppId = "";
let youdaoAppSecret = "";

export default async function translateTo({ source, target, sourceTextList, apiId, apiKey }: TranslateParams): Promise<TranslateResult> {
  youdaoAppId = apiId;
  youdaoAppSecret = apiKey;

  return batchTranslate(source, target, sourceTextList, { maxLen: 2000, batchSize: 20, interval: 1000 }, send);
}

interface YoudaoResponse {
  errorCode: string;
  translation?: string[];
}

async function send(source: string, target: string, sourceTextList: string[]): Promise<TranslateResult> {
  try {
    const results: string[] = [];
    for (const text of sourceTextList) {
      const salt = Date.now().toString();
      const curtime = Math.round(Date.now() / 1000).toString();
      const signStr = youdaoAppId + truncate(text) + salt + curtime + youdaoAppSecret;
      const sign = crypto.createHash("sha256").update(signStr).digest("hex");

      const form = new URLSearchParams({
        q: text,
        from: source,
        to: target,
        appKey: youdaoAppId,
        salt,
        sign,
        signType: "v3",
        curtime
      });

      const response = await axios.post<YoudaoResponse>(baseUrl, form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });

      if (response.data.errorCode !== "0" || !response.data.translation || response.data.translation.length === 0) {
        return { success: false, message: t("translator.youdao.error", response.data.errorCode) };
      }

      results.push(response.data.translation[0].trim());
      await delay(100); // 小延迟防止频繁请求被限速
    }

    return { success: true, data: results };
  } catch (e: unknown) {
    if (e instanceof Error) {
      return { success: false, message: e.message };
    } else {
      return { success: false, message: e as string };
    }
  }
}

// 工具函数：符合有道 API 签名规范
function truncate(q: string) {
  const len = q.length;
  if (len <= 20) return q;
  return q.substring(0, 10) + len + q.substring(len - 10, len);
}

function delay(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}
