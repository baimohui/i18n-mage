import axios from "axios";
import { TranslateParams, TranslateResult } from "../types";
import { batchTranslate } from "./utils/batchTranslate";
import { t } from "@/utils/i18n";

const baseUrl = "https://api.deepseek.com/v1/chat/completions";

let deepseekApiKey = "";

export default async function translateTo({ source, target, sourceTextList, apiKey }: TranslateParams): Promise<TranslateResult> {
  deepseekApiKey = apiKey;
  return batchTranslate(source, target, sourceTextList, { maxLen: 2000, batchSize: 10, interval: 1100 }, send);
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
    const SEP = "[[[SEP]]]";
    const sourceText = sourceTextList.join(SEP);
    const messages = [
      {
        role: "system",
        content: `你是专业翻译助手，请直接翻译用户提供的文本，保持分隔符 ${SEP} 不变，不要添加解释。`
      },
      {
        role: "user",
        content: `将以下${source}文本翻译为${target}：\n${sourceText}`
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
        message: t("translator.deepseek.lineCountMismatch", result.join("\n"))
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
