import axios from "axios";
import { TranslateParams, TranslateResult } from "../types";

const baseUrl = "https://api.deepseek.com/v1/chat/completions";

// const errorCodeMap: Record<number, string> = {
//   52001: "请求超时，请重试",
//   52002: "系统错误，请重试",
//   52003: "未授权用户，请检查 appid 是否正确或者服务是否开通",
//   54000: "必填参数为空，请检查是否少传参数",
//   54001: "签名错误，请检查您的签名生成方法",
//   54003: "访问频率受限，请降低您的调用频率，或进行身份认证后切换为高级版/尊享版",
//   54004: "账户余额不足，请前往管理控制台为账户充值",
//   54005: "长 query 请求频繁，请降低长 query 的发送频率，3s 后再试",
//   58000: "客户端 IP 非法，请检查个人资料里填写的 IP 地址是否正确，可前往开发者信息 - 基本信息修改",
//   58001: "译文语言方向不支持，请检查译文语言是否在语言列表里",
//   58002: "服务当前已关闭，请前往管理控制台开启服务",
//   90107: "认证未通过或未生效，请前往查看认证进度"
// };

let deepseekApiKey = "";

const translateTo = async ({ source, target, sourceTextList, apiKey }: TranslateParams): Promise<TranslateResult> => {
  deepseekApiKey = apiKey;
  const translateLenLimit = 2000; // a request content max length
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
