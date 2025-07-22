import axios from "axios";
import { t } from "@/utils/i18n";
import { TranslateParams, TranslateResult } from "../types";

const baseUrl = "https://api.deepseek.com/v1/chat/completions";

let deepseekApiKey = "";

export default async function translateTo({ source, target, sourceTextList, apiKey }: TranslateParams): Promise<TranslateResult> {
  deepseekApiKey = apiKey;
  const translateLenLimit = 1000; // a request content max length
  const secondRequestLimit = 10; // the max times per second to request
  let sum = 0;
  let pack: string[] = [];
  const packList: string[][] = [];
  sourceTextList.forEach(text => {
    sum += text.length;
    if (text.length > translateLenLimit) {
      return { success: false, message: t("translator.exceedTextLenPerRequest", text) };
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
}

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

async function send(source: string, target: string, sourceTextList: string[]): Promise<TranslateResult> {
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
    let result = response.data.choices[0].message.content;
    result = normalizeLineBreaks(sourceText, result);
    const transformedList: string[] = [];
    const resList = result.split(/\r?\n/);
    let curResIndex = 0;
    sourceTextList.forEach(text => {
      const newlineCount = (text.match(/\n/g) || []).length + 1;
      transformedList.push(
        resList
          .slice(curResIndex, curResIndex + newlineCount)
          .join("\n")
          .trim()
      );
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
}

/**
 * 标准化换行格式
 * @param original 原文
 * @param translated 译文
 * @returns 保持原始换行格式的译文
 */
function normalizeLineBreaks(original: string, translated: string): string {
  // 1. 提取原文换行模式
  const originalLines = original.split("\n");
  // 2. 分割译文（考虑可能的多余换行）
  const translatedLines = translated.split(/\r?\n/).filter(line => line.trim() !== "");
  // 3. 确保行数匹配
  if (originalLines.length !== translatedLines.length) {
    console.warn(`行数不匹配：原文${originalLines.length}行，译文${translatedLines.length}行`);
  }
  // 4. 重建保持原始换行格式的译文
  let result = "";
  for (let i = 0; i < Math.min(originalLines.length, translatedLines.length); i++) {
    result += translatedLines[i];
    // 保留原文每行后的换行符
    if (i < originalLines.length - 1) {
      result += "\n";
      // 检测原文行尾是否有换行
      if (originalLines[i].endsWith("\n") || (i === 0 && original.startsWith("\n"))) {
        result += "\n";
      }
    }
  }
  return result;
}
