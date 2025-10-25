import { GenKeyResult, KeyStyle } from "@/types";
import { t } from "@/utils/i18n";

/**
 * 批量调度器
 * @param source 源语言
 * @param target 目标语言
 * @param sourceTextList 原文列表
 * @param options 配置项
 * @param sendFn 实际的发送函数（不同服务实现）
 */
export async function batchGenerate(
  sourceTextList: string[],
  style: KeyStyle,
  maxLen: number,
  options: {
    maxLen: number; // 单次请求最大字数
    batchSize: number; // 每批最多多少次请求
    interval: number; // 每批间隔 ms
  },
  sendFn: (texts: string[], style: KeyStyle, maxLen: number) => Promise<GenKeyResult>
): Promise<GenKeyResult> {
  const { maxLen: requestMaxLen, batchSize, interval } = options;

  let sum = 0;
  let pack: string[] = [];
  const packList: string[][] = [];

  // 拆包逻辑
  for (const text of sourceTextList) {
    sum += text.length;
    if (text.length > requestMaxLen) {
      return { success: false, message: t(`translator.googleError.limitedTextLength`, text) };
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

  // 分批发送
  for (let i = 0; i < packList.length; i += batchSize) {
    const batch = packList.slice(i, i + batchSize);
    for (const texts of batch) {
      const res = await sendFn(texts, style, maxLen);
      if (!res.success) return res;
      result.data!.push(...(res.data ?? []));
    }
    if (i + batchSize < packList.length) {
      await new Promise(r => setTimeout(r, interval));
    }
  }

  return result;
}
