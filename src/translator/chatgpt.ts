import axios from "axios";
import { TranslateParams, TranslateResult } from "../types";
import { batchTranslate } from "./utils/batchTranslate";
import { t } from "@/utils/i18n";

const baseUrl = "https://api.openai.com/v1/chat/completions";

let openaiApiKey = "";

export default async function translateTo({
  source,
  target,
  sourceTextList,
  apiKey,
  customPrompt = ""
}: TranslateParams): Promise<TranslateResult> {
  openaiApiKey = apiKey;
  return batchTranslate(
    source,
    target,
    sourceTextList,
    { maxLen: 4000, batchSize: 20, interval: 800 },
    (sourceCode, targetCode, sourceList) => send(sourceCode, targetCode, sourceList, customPrompt)
  );
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

async function send(source: string, target: string, sourceTextList: string[], customPrompt = ""): Promise<TranslateResult> {
  try {
    const SEP = "[[[SEP]]]";
    const sourceText = sourceTextList.join(SEP);
    const prompt = customPrompt.trim();
    const messages = [
      {
        role: "system",
        content: `You are a professional translation assistant. Translate the given text accurately from ${source} to ${target}. ${
          sourceTextList.length > 1 ? "Keep the separator " + SEP + " unchanged, and do not add or remove it." : ""
        } Do not add any explanations or extra output.${prompt ? "\n" + prompt : ""}`
      },
      {
        role: "user",
        content: `Translate the following ${source} text into ${target}:\n${sourceText}`
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
      transformedList.push(line === "" ? sourceTextList[index] : line);
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
