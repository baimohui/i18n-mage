import axios from "axios";
import { TranslateParams, TranslateResult } from "../types";
import { batchTranslate } from "./utils/batchTranslate";
import { t } from "@/utils/i18n";

const baseUrl = "https://translation.googleapis.com/language/translate/v2";

let googleApiKey = "";

export default async function translateTo({ source, target, sourceTextList, apiKey }: TranslateParams): Promise<TranslateResult> {
  googleApiKey = apiKey;
  return batchTranslate(source, target, sourceTextList, { maxLen: 3000, batchSize: 40, interval: 700 }, send);
}

interface GoogleTranslateResponse {
  data: {
    translations: {
      translatedText: string;
    }[];
  };
}

async function send(source: string, target: string, sourceTextList: string[]): Promise<TranslateResult> {
  try {
    const response = await axios.post<GoogleTranslateResponse>(
      `${baseUrl}?key=${googleApiKey}`,
      {
        q: sourceTextList,
        source,
        target,
        format: "text"
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const result = response.data.data.translations.map(t => t.translatedText.trim());

    if (result.length !== sourceTextList.length) {
      return {
        success: false,
        message: t("translator.deepseek.lineCountMismatch", result.join(" | "))
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
