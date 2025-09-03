import { translate } from "@vitalets/google-translate-api";
import { t } from "@/utils/i18n";
import { getProxyAgent } from "@/utils/proxy";
import { batchTranslate } from "./utils/batchTranslate";
import { TranslateParams, TranslateResult } from "@/types";

export default async function translateTo({ source, target, sourceTextList }: TranslateParams): Promise<TranslateResult> {
  return batchTranslate(source, target, sourceTextList, { maxLen: 5000, batchSize: 1, interval: 2000 }, send);
}

async function send(source: string, target: string, sourceTextList: string[]): Promise<TranslateResult> {
  const sourceText = sourceTextList.join("\n");
  const agent = getProxyAgent();
  try {
    const res = (await translate(sourceText, {
      from: source,
      to: target,
      fetchOptions: { agent }
    })) as { text: string; message?: string };

    if (res.text) {
      const transformed: string[] = [];
      const resList = res.text.split("\n");
      let curResIndex = 0;

      for (const text of sourceTextList) {
        const newlineCount = (text.match(/\n/g) || []).length + 1;
        transformed.push(resList.slice(curResIndex, curResIndex + newlineCount).join("\n"));
        curResIndex += newlineCount;
      }

      return { success: true, data: transformed };
    } else {
      return { success: false, message: res.message ?? t("common.unknownError") };
    }
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : (e as string) };
  }
}
