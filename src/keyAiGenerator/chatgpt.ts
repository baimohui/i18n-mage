import axios from "axios";
import { GenKeyParams, GenKeyResult } from "../types";
import { batchGenerate } from "./utils/batchGenerate";
import { t } from "@/utils/i18n";
import { getProxyAgent } from "@/utils/proxy";

const baseUrl = "https://api.openai.com/v1/chat/completions";

let openaiApiKey = "";

export default async function translateTo({ style, maxLen, sourceTextList, apiKey }: GenKeyParams): Promise<GenKeyResult> {
  openaiApiKey = apiKey;
  return batchGenerate(sourceTextList, style, maxLen, { maxLen: 2000, batchSize: 10, interval: 1100 }, send);
}

interface OpenAIAPIResponse {
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
    const agent = getProxyAgent();
    const SEP = "[[[SEP]]]";
    const sourceText = sourceTextList.join(SEP);
    const messages = [
      {
        role: "system",
        content: `You are an intelligent key name generator. Generate concise, meaningful, and convention-compliant keys for the given text.${
          sourceTextList.length > 1
            ? " Keep the separator " + SEP + " unchanged, and make sure the output uses the same separator between each key."
            : ""
        } Follow these strict rules:
    1. Only output the generated keys. Do not include explanations, numbering, or extra text.
    2. Each key must accurately represent the meaning of the source text.
    3. Key style: ${style} (camelCase / PascalCase / snake_case / kebab-case)
    4. Maximum length: ${maxLength} characters.
    5. Keys must contain only English letters or common abbreviations, no spaces, symbols, or non-English characters.`
      },
      {
        role: "user",
        content: `Generate keys for the following text:\n${sourceText}`
      }
    ];

    const response = await axios.post<OpenAIAPIResponse>(
      baseUrl,
      {
        model: "gpt-4o-mini", // fast, cost-effective model
        messages,
        temperature: 0
      },
      {
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json"
        },
        httpsAgent: agent
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
