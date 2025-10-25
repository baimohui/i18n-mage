import axios from "axios";
import { GenKeyParams, GenKeyResult } from "../types";
import { batchGenerate } from "./utils/batchGenerate";
import { t } from "@/utils/i18n";

const baseUrl = "https://api.deepseek.com/v1/chat/completions";

let deepseekApiKey = "";

export default async function translateTo({ style, maxLen, sourceTextList, apiKey }: GenKeyParams): Promise<GenKeyResult> {
  deepseekApiKey = apiKey;
  return batchGenerate(sourceTextList, style, maxLen, { maxLen: 2000, batchSize: 10, interval: 1100 }, send);
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

async function send(sourceTextList: string[], style: string, maxLength: number): Promise<GenKeyResult> {
  try {
    const SEP = "[[[SEP]]]";
    const sourceText = sourceTextList.join(SEP);
    const messages = [
      {
        role: "system",
        content: `你是一个智能键名生成器。请为用户提供的每条文本生成语义明确、符合命名规范的 key。
  ${sourceTextList.length > 1 ? `多条文本之间使用 ${SEP} 作为分隔符，生成的结果也必须使用相同分隔符。` : ""}
  请严格遵守以下规则：
  1. 仅输出生成的 key，不要包含解释、编号或额外文字。
  2. key 长度不大于 ${maxLength}。
  3. key 风格：${style}。
  4. key 必须表达文本含义，简洁且可读。
  5. 仅使用英文单词或常见缩写，不得含中文、空格或符号。`
      },
      {
        role: "user",
        content: `为以下文本生成 key：\n${sourceText}`
      }
    ];
    const response = await axios.post<DeepSeekAPIResponse>(
      baseUrl,
      {
        model: "deepseek-chat",
        messages,
        temperature: 0 // 保证稳定输出
      },
      {
        headers: {
          Authorization: `Bearer ${deepseekApiKey}`,
          "Content-Type": "application/json"
        }
      }
    );
    const result = response.data.choices[0].message.content.split(SEP).map(line => line.trim());
    if (result.length !== sourceTextList.length) {
      return {
        success: false,
        message: t("translator.deepseek.lineCountMismatch", result.join(SEP))
      };
    }
    const transformedList: string[] = [];
    result.forEach((line, index) => {
      if (line === "") {
        transformedList.push(sourceTextList[index]);
      } else {
        transformedList.push(line);
      }
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
