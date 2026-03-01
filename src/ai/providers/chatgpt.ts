import axios from "axios";
import { GenKeyParams, GenKeyResult, TranslateParams, TranslateResult } from "@/types";
import { t } from "@/utils/i18n";
import { getProxyAgent } from "@/utils/proxy";
import { AiProvider } from "@/ai/types";
import { batchTranslate } from "@/ai/shared/batchTranslate";
import { batchGenerate } from "@/ai/shared/batchGenerate";

const baseUrl = "https://api.openai.com/v1/chat/completions";
const SEP = "[[[SEP]]]";

interface OpenAIAPIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

async function requestCompletion(apiKey: string, messages: Array<{ role: "system" | "user"; content: string }>): Promise<string> {
  const agent = getProxyAgent();
  const response = await axios.post<OpenAIAPIResponse>(
    baseUrl,
    {
      model: "gpt-4o-mini",
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
  const { source, target, sourceTextList, apiKey, customPrompt = "" } = params;
  return batchTranslate(
    source,
    target,
    sourceTextList,
    { maxLen: 4000, batchSize: 20, interval: 800 },
    async (sourceCode, targetCode, sourceList) => {
      try {
        const sourceText = sourceList.join(SEP);
        const prompt = customPrompt.trim();
        const content = await requestCompletion(apiKey, [
          {
            role: "system",
            content:
              `You are a professional translation assistant. Translate from ${sourceCode} to ${targetCode}. ` +
              `${sourceList.length > 1 ? `Keep separator ${SEP} unchanged. ` : ""}` +
              `Return translation only with no explanations.${prompt ? "\n" + prompt : ""}`
          },
          {
            role: "user",
            content: `Translate the following text:\n${sourceText}`
          }
        ]);

        const result = content.split(SEP).map(line => line.trim());
        if (result.length !== sourceList.length) {
          return { success: false, message: t("translator.deepseek.lineCountMismatch", result.join(SEP)) };
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
  const { style, maxLen, sourceTextList, apiKey } = params;
  return batchGenerate(
    sourceTextList,
    style,
    maxLen,
    { maxLen: 2000, batchSize: 10, interval: 1100 },
    async (sourceList, keyStyle, keyMaxLen) => {
      try {
        const sourceText = sourceList.join(SEP);
        const content = await requestCompletion(apiKey, [
          {
            role: "system",
            content:
              `You generate i18n keys. For each source text, generate exactly one key. ` +
              `${sourceList.length > 1 ? `Keep separator ${SEP} unchanged. ` : ""}` +
              `Style: ${keyStyle}. Max length: ${keyMaxLen}. ` +
              `Only output keys. No numbering, no explanation.`
          },
          {
            role: "user",
            content: `Generate keys for the following text:\n${sourceText}`
          }
        ]);

        const result = content.split(SEP).map(line => line.trim());
        if (result.length !== sourceList.length) {
          return { success: false, message: t("translator.deepseek.lineCountMismatch", result.join(SEP)) };
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

const chatgptProvider: AiProvider = {
  id: "chatgpt",
  translate,
  generateKey
};

export default chatgptProvider;
