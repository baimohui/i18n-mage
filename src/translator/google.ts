import tunnel from "tunnel";
import { translate } from "@vitalets/google-translate-api";

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

const translateTo = async ({ source, target, sourceTextList }: TranslateParams): Promise<TranslateResult> => {
  const translateLenLimit = 5000;
  const secondRequestLimit = 1;
  let sum = 0;
  let pack: string[] = [];
  const packList: string[][] = [];
  
  for (const text of sourceTextList) {
    sum += text.length;
    if (text.length > translateLenLimit) {
      return { success: false, message: `文本字符数超出单次翻译请求限制：${text}` };
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
};

const sendBatch = async (
  source: string,
  target: string,
  packList: string[][],
  batchNum: number,
  batchSize: number
): Promise<TranslateResult> => {
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
      setTimeout(async () => {
        const batchRes = await sendBatch(source, target, packList, batchNum + 1, batchSize);
        if (batchRes.success) {
          result.data!.push(...batchRes.data!);
          resolve(result);
        } else {
          resolve(batchRes);
        }
      }, 1100);
    });
  } else {
    return result;
  }
};

const send = async (source: string, target: string, sourceTextList: string[]): Promise<TranslateResult> => {
  const sourceText = sourceTextList.join("\n");
  try {
    const res = await translate(sourceText, {
      from: source,
      to: target,
      fetchOptions: {
        agent: tunnel.httpsOverHttp({
          proxy: {
            port: 7890,
            host: "127.0.0.1",
            headers: {
              "User-Agent": "Node"
            }
          }
        })
      }
    }) as { text: string; message?: string };

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
      return { success: false, message: res.message || "未知错误" };
    }
  } catch (e: any) {
    return { success: false, message: e.message };
  }
};

export default translateTo;
