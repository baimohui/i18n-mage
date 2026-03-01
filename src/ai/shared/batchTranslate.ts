import { TranslateResult } from "@/types";
import { t } from "@/utils/i18n";

export async function batchTranslate(
  source: string,
  target: string,
  sourceTextList: string[],
  options: {
    maxLen: number;
    batchSize: number;
    interval: number;
  },
  sendFn: (source: string, target: string, texts: string[]) => Promise<TranslateResult>
): Promise<TranslateResult> {
  const { maxLen, batchSize, interval } = options;

  let sum = 0;
  let pack: string[] = [];
  const packList: string[][] = [];

  for (const text of sourceTextList) {
    sum += text.length;
    if (text.length > maxLen) {
      return { success: false, message: t("translator.googleError.limitedTextLength", text) };
    }
    if (sum > maxLen) {
      packList.push(pack);
      pack = [];
      sum = text.length;
    }
    pack.push(text);
  }
  packList.push(pack);

  const result: TranslateResult = { success: true, data: [], message: "" };

  for (let i = 0; i < packList.length; i += batchSize) {
    const batch = packList.slice(i, i + batchSize);
    for (const texts of batch) {
      const res = await sendFn(source, target, texts);
      if (!res.success) return res;
      result.data!.push(...(res.data ?? []));
    }
    if (i + batchSize < packList.length) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  return result;
}
