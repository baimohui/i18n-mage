import { GenKeyResult, KeyStyle } from "@/types";
import { t } from "@/utils/i18n";

export async function batchGenerate(
  sourceTextList: string[],
  style: KeyStyle,
  maxLen: number,
  options: {
    maxLen: number;
    batchSize: number;
    interval: number;
  },
  sendFn: (texts: string[], style: KeyStyle, maxLen: number) => Promise<GenKeyResult>
): Promise<GenKeyResult> {
  const { maxLen: requestMaxLen, batchSize, interval } = options;

  let sum = 0;
  let pack: string[] = [];
  const packList: string[][] = [];

  for (const text of sourceTextList) {
    sum += text.length;
    if (text.length > requestMaxLen) {
      return { success: false, message: t("translator.googleError.limitedTextLength", text) };
    }
    if (sum > requestMaxLen) {
      packList.push(pack);
      pack = [];
      sum = text.length;
    }
    pack.push(text);
  }
  packList.push(pack);

  const result: GenKeyResult = { success: true, data: [], message: "" };

  for (let i = 0; i < packList.length; i += batchSize) {
    const batch = packList.slice(i, i + batchSize);
    for (const texts of batch) {
      const res = await sendFn(texts, style, maxLen);
      if (!res.success) return res;
      result.data!.push(...(res.data ?? []));
    }
    if (i + batchSize < packList.length) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  return result;
}
