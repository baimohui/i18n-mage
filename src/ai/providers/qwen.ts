import axios from "axios";
import { GenKeyParams, GenKeyResult, SelectPrefixParams, SelectPrefixResult, TranslateParams, TranslateResult } from "@/types";
import { t } from "@/utils/i18n";
import { getProxyAgent } from "@/utils/proxy";
import { AiProvider } from "@/ai/types";
import { batchTranslate } from "@/ai/shared/batchTranslate";
import { batchGenerate } from "@/ai/shared/batchGenerate";
import { buildIndexedItems, parseListOutput } from "@/ai/shared/listOutput";

const baseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const defaultModel = "qwen-plus";

interface QwenAPIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

async function requestCompletion(
  apiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>
): Promise<string> {
  const agent = getProxyAgent();
  const response = await axios.post<QwenAPIResponse>(
    baseUrl,
    {
      model,
      messages,
      temperature: 0
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      httpsAgent: agent
    }
  );
  return response.data.choices[0].message.content;
}

async function translate(params: TranslateParams): Promise<TranslateResult> {
  const { source, target, sourceTextList, apiId, apiKey, customPrompt = "" } = params;
  const model = apiId || defaultModel;
  return batchTranslate(
    source,
    target,
    sourceTextList,
    { maxLen: 4000, batchSize: 20, interval: 800 },
    async (sourceCode, targetCode, sourceList) => {
      try {
        const sourceText = buildIndexedItems(sourceList);
        const prompt = customPrompt.trim();
        const content = await requestCompletion(apiKey, model, [
          {
            role: "system",
            content:
              `You are a professional translation assistant. Translate from ${sourceCode} to ${targetCode}. ` +
              `Do not split or merge items. ` +
              `Return strict JSON array only, same length and order as input items. ` +
              `No explanation, no markdown.${prompt ? "\n" + prompt : ""}`
          },
          {
            role: "user",
            content: `Translate the following items:\n` + `${sourceText}\n` + `Output example: ["translated text 1","translated text 2"]`
          }
        ]);

        const result = parseListOutput(content, sourceList.length);
        if (result.length !== sourceList.length) {
          return { success: false, message: t("translator.deepseek.lineCountMismatch", result.join(" | ")) };
        }

        return {
          success: true,
          data: result.map((line, index) => (line === "" ? sourceList[index] : line))
        };
      } catch (e: unknown) {
        return { success: false, message: e instanceof Error ? e.message : String(e) };
      }
    }
  );
}

async function generateKey(params: GenKeyParams): Promise<GenKeyResult> {
  const { style, maxLen, sourceTextList, apiId, apiKey } = params;
  const model = apiId || defaultModel;
  return batchGenerate(
    sourceTextList,
    style,
    maxLen,
    { maxLen: 2000, batchSize: 10, interval: 1100 },
    async (sourceList, keyStyle, keyMaxLen) => {
      try {
        const sourceText = buildIndexedItems(sourceList);
        const content = await requestCompletion(apiKey, model, [
          {
            role: "system",
            content:
              `You generate i18n keys. For each source text, generate exactly one key. ` +
              `Style: ${keyStyle}. Max length: ${keyMaxLen}. ` +
              `Do not split or merge items. ` +
              `Return strict JSON array only, same length and order as input items. ` +
              `No numbering, no explanation, no markdown.`
          },
          {
            role: "user",
            content: `Generate keys for the following items:\n` + `${sourceText}\n` + `Output example: ["firstKey","secondKey"]`
          }
        ]);

        const result = parseListOutput(content, sourceList.length);
        if (result.length !== sourceList.length) {
          return { success: false, message: t("translator.deepseek.lineCountMismatch", result.join(" | ")) };
        }

        return {
          success: true,
          data: result.map((line, index) => (line === "" ? sourceList[index] : line))
        };
      } catch (e: unknown) {
        return { success: false, message: e instanceof Error ? e.message : String(e) };
      }
    }
  );
}

async function selectPrefix(params: SelectPrefixParams): Promise<SelectPrefixResult> {
  const { sourceTextList, prefixCandidates, apiId, apiKey } = params;
  const model = apiId || defaultModel;
  if (prefixCandidates.length === 0) {
    return { success: false, message: "No prefix candidates provided" };
  }
  const safeCandidates = Array.from(new Set(prefixCandidates.map(item => item.trim()).filter(Boolean)));
  if (safeCandidates.length === 0) {
    return { success: false, message: "No valid prefix candidates provided" };
  }
  try {
    const sourceText = buildIndexedItems(sourceTextList);
    const candidatesJson = JSON.stringify(safeCandidates);
    const content = await requestCompletion(apiKey, model, [
      {
        role: "system",
        content:
          `You are selecting i18n key prefixes. ` +
          `For each input text, choose exactly one prefix from the provided candidate list. ` +
          `Do not invent or modify prefixes. ` +
          `Return strict JSON array only, same length and order as input items. ` +
          `No explanation, no markdown.`
      },
      {
        role: "user",
        content:
          `Candidate prefixes:\n${candidatesJson}\n` +
          `Choose one prefix for each item:\n${sourceText}\n` +
          `Output example: ["common.form","tips"]`
      }
    ]);
    const result = parseListOutput(content, sourceTextList.length);
    if (result.length !== sourceTextList.length) {
      return { success: false, message: t("translator.deepseek.lineCountMismatch", result.join(" | ")) };
    }
    return { success: true, data: result };
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : String(e) };
  }
}

const qwenProvider: AiProvider = {
  id: "qwen",
  translate,
  generateKey,
  selectPrefix
};

export default qwenProvider;
