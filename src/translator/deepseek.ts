import axios from "axios";
import { TranslateParams, TranslateResult } from "../types";

const baseUrl = "https://api.deepseek.com/v1/chat/completions";

let deepseekApiKey = "";

const translateTo = async ({ source, target, sourceTextList, apiKey }: TranslateParams): Promise<TranslateResult> => {
  deepseekApiKey = apiKey;
  const translateLenLimit = 10000; // a request content max length
  const secondRequestLimit = 10; // the max times per second to request
  let sum = 0;
  let pack: string[] = [];
  const packList: string[][] = [];
  sourceTextList.forEach(text => {
    sum += text.length;
    if (text.length > translateLenLimit) {
      throw new Error(`文本字符数超出单次翻译请求限制：${text}`);
    }
    if (sum > translateLenLimit) {
      packList.push(pack);
      pack = [];
      sum = text.length;
    }
    pack.push(text);
  });
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
      setTimeout(() => {
        sendBatch(source, target, packList, batchNum + 1, batchSize)
          .then(batchRes => {
            if (batchRes.success) {
              result.data!.push(...batchRes.data!);
              resolve(result);
            } else {
              resolve(batchRes);
            }
          })
          .catch(error => {
            resolve({ success: false, message: error instanceof Error ? error.message : (error as string) });
          });
      }, 1100);
    });
  } else {
    return result;
  }
};

interface DeepSeekAPIResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "length" | "function_call" | "content_filter" | null;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const send = async (source: string, target: string, sourceTextList: string[]): Promise<TranslateResult> => {
  try {
    const sourceText = sourceTextList.join("\n");
    const prompt = `[角色] 专业翻译\n[要求]\n1. 语体：正式简洁\n2. 保持术语一致\n3. 保留原文语境\n4. 仅输出译文\n\n将以下${source}文本翻译为${target}：\n${sourceText}`;
    const response = await axios.post<DeepSeekAPIResponse>(
      baseUrl,
      {
        model: "deepseek-chat", // 或 "deepseek-reasoner"
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${deepseekApiKey}`,
          "Content-Type": "application/json"
        }
      }
    );
    const result = response.data.choices[0].message.content;
    const transformedList: string[] = [];
    const resList = result.split("\n");
    let curResIndex = 0;
    sourceTextList.forEach(text => {
      const newlineCount = (text.match(/\n/g) || []).length + 1;
      transformedList.push(resList.slice(curResIndex, curResIndex + newlineCount).join("\n"));
      curResIndex += newlineCount;
    });
    return { success: true, data: transformedList };
  } catch (e: unknown) {
    if (e instanceof Error) {
      return { success: false, message: e.message };
    } else {
      return { success: false, message: e as string };
    }
  }
};

export default translateTo;
