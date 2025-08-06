import { translate } from "@vitalets/google-translate-api";
import { t } from "@/utils/i18n";
import { getProxyAgent } from "@/utils/proxy";

interface TranslateParams {
  source: string;
  target: string;
  sourceTextList: string[];
}

interface TranslateResult {
  success: boolean;
  message: string;
  data?: string[];
}

export default async function translateTo({ source, target, sourceTextList }: TranslateParams): Promise<TranslateResult> {
  const translateLenLimit = 5000;
  const secondRequestLimit = 1;
  let sum = 0;
  let pack: string[] = [];
  const packList: string[][] = [];

  for (const text of sourceTextList) {
    sum += text.length;
    if (text.length > translateLenLimit) {
      return { success: false, message: t(`translator.googleError.limitedTextLength`, text) };
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
}

async function sendBatch(
  source: string,
  target: string,
  packList: string[][],
  batchNum: number,
  batchSize: number
): Promise<TranslateResult> {
  const result: TranslateResult = { success: true, message: "", data: [] };
  const packNum = batchNum * batchSize;

  for (let i = packNum; i < packNum + batchSize; i++) {
    if (packList[i] === undefined) {
      break;
    }
    const res = await send(source, target, packList[i]);
    if (!res.success) {
      return res;
    }
    result.data!.push(...res.data!);
  }

  if (packList.length > packNum + batchSize) {
    return new Promise(resolve => {
      setTimeout(() => {
        sendBatch(source, target, packList, batchNum + 1, batchSize)
          .then(batchRes => {
            if (batchRes.success) {
              result.data!.push(...batchRes.data!); // 假设 result.data 和 batchRes.data 已初始化
              resolve(result);
            } else {
              resolve(batchRes); // 直接返回失败的 batchRes
            }
          })
          .catch(error => {
            resolve({
              success: false,
              message: error instanceof Error ? error.message : t("common.unknownError")
            });
          });
      }, 1100);
    });
  } else {
    return result;
  }
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
      const transformedList: string[] = [];
      const resList = res.text.split("\n");
      let curResIndex = 0;

      for (const text of sourceTextList) {
        const newlineCount = (text.match(/\n/g) || []).length + 1;
        transformedList.push(resList.slice(curResIndex, curResIndex + newlineCount).join("\n"));
        curResIndex += newlineCount;
      }

      return { success: true, data: transformedList, message: "success" };
    } else {
      return { success: false, message: res.message ?? t("common.unknownError") };
    }
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : (e as string) };
  }
}
