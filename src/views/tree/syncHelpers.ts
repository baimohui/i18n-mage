import { t } from "@/utils/i18n";
import { getLangText } from "@/utils/langKey";

interface CheckLangSyncInfoParams {
  lang: string;
  detectedLangList: string[];
  isSyncing: boolean | string[];
  displayLang: string;
  referredLang: string;
  langInfo: {
    lack: Record<string, string[]>;
    extra: Record<string, string[]>;
    null: Record<string, string[]>;
  };
  countryMap: Record<string, Record<string, string>>;
}

export function checkLangSyncInfo(params: CheckLangSyncInfoParams) {
  const { lang, detectedLangList, isSyncing, displayLang, referredLang, langInfo, countryMap } = params;
  const contextValueList = ["checkSyncInfo"];
  let tooltip = getLangText(lang) || t("common.unknownLang");
  if (!getLangText(lang)) {
    contextValueList.push("UNKNOWN_LANG");
  }

  const list: string[] = [];
  let icon = "pass";
  let data: string[] = [];

  if (detectedLangList.includes(lang)) {
    list.push(getLangText(lang) || t("common.unknownLang"));
    const lackNum = langInfo.lack[lang]?.length ?? 0;
    const extraNum = langInfo.extra[lang]?.length ?? 0;
    const nullNum = langInfo.null[lang]?.length ?? 0;
    if (lackNum > 0 || nullNum > 0) {
      data = [...(langInfo.lack[lang] ?? []), ...(langInfo.null[lang] ?? [])].filter(key => !!countryMap[referredLang]?.[key]);
      if (data.length > 0) {
        contextValueList.push("FILL_VALUE");
      }
      if (isSyncing === true || (Array.isArray(isSyncing) && isSyncing.includes(lang))) {
        icon = "sync~spin";
      } else {
        icon = "sync";
      }
      list.push(`-${lackNum + nullNum}`);
    }
    if (extraNum > 0) {
      list.push(`+${extraNum}`);
    }
  }

  if (lang === referredLang && lang === displayLang) {
    list.push("🧙");
    tooltip += ` (${t("tree.syncInfo.baseline")})`;
    contextValueList.push("REFERENCE_LANG", "DISPLAY_LANG");
  } else if (lang === referredLang) {
    tooltip += ` (${t("tree.syncInfo.source")})`;
    list.push("🌐");
    contextValueList.push("REFERENCE_LANG");
  } else if (lang === displayLang) {
    tooltip += ` (${t("tree.syncInfo.display")})`;
    list.push("👁️");
    contextValueList.push("DISPLAY_LANG");
  } else if (!detectedLangList.includes(lang)) {
    icon = "sync-ignored";
    tooltip += ` (${t("tree.syncInfo.ignored")})`;
    contextValueList.push("IGNORED_LANG");
    list.push("👻");
  }

  return { desc: list.join(" "), icon, tooltip, context: contextValueList.join(","), data };
}

interface GetSyncInfoParams {
  lang: string;
  syncBasedOnReferredEntries: boolean;
  referredLang: string;
  langInfo: {
    extra: Record<string, string[]>;
    null: Record<string, string[]>;
    lack: Record<string, string[]>;
  };
  countryMap: Record<string, Record<string, string>>;
}

export function getSyncInfo(params: GetSyncInfoParams) {
  const { lang, syncBasedOnReferredEntries, referredLang, langInfo, countryMap } = params;
  const totalKeys = Object.keys(countryMap?.[lang] ?? {});
  totalKeys.sort((a, b) => (a > b ? 1 : -1));
  const commonEntryKeyList: string[] = [];
  const extraEntryKeyList = langInfo.extra?.[lang] ?? [];
  const nullEntryKeyList = langInfo.null?.[lang] ?? [];
  const lackEntryKeyList = langInfo.lack?.[lang] ?? [];

  totalKeys.forEach(key => {
    if (!extraEntryKeyList.includes(key) && !nullEntryKeyList.includes(key)) {
      commonEntryKeyList.push(key);
    }
  });

  const res = [
    { label: t("tree.syncInfo.normal"), num: commonEntryKeyList.length, data: commonEntryKeyList, type: "common" },
    {
      label: t("tree.syncInfo.null"),
      num: nullEntryKeyList.length,
      data: nullEntryKeyList,
      type: "null",
      contextValue: nullEntryKeyList.some(key => !!countryMap[referredLang]?.[key]) ? "FILL_VALUE" : ""
    },
    {
      label: t("tree.syncInfo.lack"),
      num: lackEntryKeyList.length,
      data: lackEntryKeyList,
      type: "lack",
      contextValue: lackEntryKeyList.some(key => !!countryMap[referredLang]?.[key]) ? "FILL_VALUE" : ""
    }
  ];

  if (syncBasedOnReferredEntries) {
    res.push({ label: t("tree.syncInfo.extra"), num: extraEntryKeyList.length, data: extraEntryKeyList, type: "extra" });
  }
  return res;
}

interface GetSyncPercentParams {
  lack: Record<string, string[]>;
  null: Record<string, string[]>;
  syncBasedOnReferredEntries: boolean;
  referredLang: string;
  countryMap: Record<string, Record<string, string>>;
  dictionary: Record<string, unknown>;
}

export function getSyncPercent(params: GetSyncPercentParams): string {
  const { lack, null: nullInfo, syncBasedOnReferredEntries, referredLang, countryMap, dictionary } = params;
  const lackList = Object.values(lack);
  const lackNum = lackList.reduce((pre, cur) => pre + cur.length, 0);
  const nullList = Object.values(nullInfo);
  const nullNum = nullList.reduce((pre, cur) => pre + cur.length, 0);

  let total = Object.keys(syncBasedOnReferredEntries ? countryMap[referredLang] : dictionary).length;
  total = lackList.length ? total * lackList.length : total;
  return Math.floor(Number((((total - lackNum - nullNum) / total) * 10000).toFixed(0))) / 100 + "%";
}
