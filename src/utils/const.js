const { hasOwn } = require("./common");

// 多语言文件名/翻译平台语言码映射表
const LANG_INTRO_MAP = {
  ara: { cnName: "阿拉伯语", enName: "Arabic", ggCode: "ar", tcCode: "ar", bdCode: "ara" },
  cs: { cnName: "捷克语", enName: "Czech", ggCode: "cs", tcCode: "", bdCode: "cs" },
  da: { cnName: "丹麦语", enName: "Danish", ggCode: "da", tcCode: "", bdCode: "dan" },
  de: { cnName: "德语", enName: "German", ggCode: "de", tcCode: "de", bdCode: "de" },
  en: { cnName: "英语", enName: "English", ggCode: "en", tcCode: "en", bdCode: "en" },
  spa: { cnName: "西班牙语", enName: "Spanish", ggCode: "es", tcCode: "es", bdCode: "spa" },
  fra: { cnName: "法语", enName: "French", ggCode: "fr", tcCode: "fr", bdCode: "fra" },
  hr: { cnName: "克罗地亚语", enName: "Croatian", ggCode: "hr", tcCode: "", bdCode: "hrv" },
  hu: { cnName: "匈牙利语", enName: "Hungarian", ggCode: "hu", tcCode: "", bdCode: "hu" },
  id: { cnName: "印尼语", enName: "Indonesian", ggCode: "id", tcCode: "id", bdCode: "id" },
  it: { cnName: "意大利语", enName: "Italian", ggCode: "it", tcCode: "it", bdCode: "it" },
  jp: { cnName: "日语", enName: "Japanese", ggCode: "ja", tcCode: "ja", bdCode: "jp" },
  kor: { cnName: "韩语", enName: "Korean", ggCode: "ko", tcCode: "ko", bdCode: "kor" },
  cht: { cnName: "繁体中文", enName: "Traditional Chinese", ggCode: "zh-TW", tcCode: "zh-TW", bdCode: "cht" },
  nl: { cnName: "荷兰语", enName: "Dutch", ggCode: "nl", tcCode: "nl", bdCode: "nl" },
  no: { cnName: "挪威语", enName: "Norwegian", ggCode: "no", tcCode: "", bdCode: "nor" },
  pl: { cnName: "波兰语", enName: "Polish", ggCode: "pl", tcCode: "", bdCode: "pl" },
  pt: { cnName: "葡萄牙语", enName: "Portuguese", ggCode: "pt", tcCode: "pt", bdCode: "pt" },
  rom: { cnName: "罗马尼亚语", enName: "Romanian", ggCode: "ro", tcCode: "", bdCode: "rom" },
  ru: { cnName: "俄语", enName: "Russian", ggCode: "ru", tcCode: "ru", bdCode: "ru" },
  sk: { cnName: "斯洛伐克语", enName: "Slovak", ggCode: "sk", tcCode: "", bdCode: "sk" },
  sv: { cnName: "瑞典语", enName: "Swedish", ggCode: "sv", tcCode: "", bdCode: "swe" },
  th: { cnName: "泰语", enName: "Thai", ggCode: "th", tcCode: "th", bdCode: "th" },
  tr: { cnName: "土耳其语", enName: "Turkish", ggCode: "tr", tcCode: "tr", bdCode: "tr" },
  ukr: { cnName: "乌克兰语", enName: "Ukrainian", ggCode: "uk", tcCode: "", bdCode: "ukr" },
  uz: { cnName: "乌兹别克语", enName: "Uzbek", ggCode: "uz", tcCode: "", bdCode: "" },
  zh: { cnName: "简体中文", enName: "Simplified Chinese", ggCode: "zh-CN", tcCode: "zh", bdCode: "zh" }
};

// 多语言文件别名映射表
const LANG_ALIAS_MAP = {
  en: ["en-US"],
  id: ["in", "id-ID"],
  pt: ["po", "por"],
  tr: ["tr-TR"],
  zh: ["cn", "zh-cn", "zh-CN"],
  ara: ["ar"],
  cht: ["tc", "cn_tc", "zh-tw", "zh_tw", "zh-TW", "zh_TW"],
  fra: ["fr"],
  kor: ["ko"],
  rom: ["ro"],
  spa: ["es", "es-419", "es-ES", "es-419-ES", "es-MX", "es-419-MX", "el"],
  ukr: ["uk"]
};

// 根据多语言文件名获取对应语种简介
const getLangIntro = str => {
  str = str.split(".")[0];
  if (!hasOwn(LANG_INTRO_MAP, str)) {
    for (const key in LANG_ALIAS_MAP) {
      if (LANG_ALIAS_MAP[key].includes(str)) {
        str = key;
        break;
      }
    }
  }
  return LANG_INTRO_MAP[str] || {};
};

// 根据多语言文件名获取对应语种名称
const getLangText = (str, type = "cn") => {
  const intro = getLangIntro(str);
  if (type === "cn") {
    return intro.cnName || "未知语种";
  } else if (type === "en") {
    return intro.enName || "Unknown language";
  } else {
    return str;
  }
};

// 根据多语言文件名和平台获取对应语种代码
const getLangCode = (str, platform = "google") => {
  const intro = getLangIntro(str);
  const map = { google: "ggCode", tencent: "tcCode", baidu: "bdCode" };
  return intro[map[platform]] || str;
};

// 多语言文件内容展示格式
const LANG_FORMAT_TYPE = {
  obj: "OBJECT",
  nonObj: "NON_OBJECT",
  nestedObj: "OBJECT_NESTED"
};

// 条目默认分隔符
const LANG_ENTRY_SPLIT_SYMBOL = {
  [LANG_FORMAT_TYPE.obj]: "_",
  [LANG_FORMAT_TYPE.nonObj]: ".",
  [LANG_FORMAT_TYPE.nestedObj]: "."
};

module.exports = {
  getLangIntro,
  getLangText,
  getLangCode,
  LANG_INTRO_MAP,
  LANG_FORMAT_TYPE,
  LANG_ENTRY_SPLIT_SYMBOL
};
