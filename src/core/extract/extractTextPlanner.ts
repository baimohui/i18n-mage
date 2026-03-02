import { UNMATCHED_LANGUAGE_ACTION, UnmatchedLanguageAction } from "@/types";
import { getLangCode } from "@/utils/langKey";
import { validateLang } from "@/utils/regex";

export interface PlannedTextSelection {
  uniqueTexts: string[];
  sourceLangMap: Map<string, string>;
  skippedTextSet: Set<string>;
  fillWithOriginalTextSet: Set<string>;
}

export interface EnglishKeyPlan {
  directTextSet: Set<string>;
  translationGroups: Record<string, string[]>;
}

export function planTextsByLanguage(params: {
  uniqueTexts: string[];
  referredLang: string;
  onlyExtractSourceLanguageText: boolean;
  validateLanguageBeforeTranslate: boolean;
  unmatchedLanguageAction: UnmatchedLanguageAction;
  switchedLangByText?: Record<string, string>;
}): PlannedTextSelection {
  const sourceLangMap = new Map<string, string>(params.uniqueTexts.map(text => [text, params.referredLang]));
  const skippedTextSet = new Set<string>();
  const fillWithOriginalTextSet = new Set<string>();
  if (params.onlyExtractSourceLanguageText || !params.validateLanguageBeforeTranslate) {
    return {
      uniqueTexts: [...params.uniqueTexts],
      sourceLangMap,
      skippedTextSet,
      fillWithOriginalTextSet
    };
  }
  const nonSourceTexts = params.uniqueTexts.filter(text => !validateLang(text, params.referredLang));
  if (nonSourceTexts.length === 0) {
    return {
      uniqueTexts: [...params.uniqueTexts],
      sourceLangMap,
      skippedTextSet,
      fillWithOriginalTextSet
    };
  }
  const switchedLangByText = params.switchedLangByText ?? {};
  nonSourceTexts.forEach(text => {
    switch (params.unmatchedLanguageAction) {
      case UNMATCHED_LANGUAGE_ACTION.ignore:
        skippedTextSet.add(text);
        break;
      case UNMATCHED_LANGUAGE_ACTION.fill:
        fillWithOriginalTextSet.add(text);
        break;
      case UNMATCHED_LANGUAGE_ACTION.switch:
        sourceLangMap.set(text, switchedLangByText[text] ?? params.referredLang);
        break;
      case UNMATCHED_LANGUAGE_ACTION.force:
      case UNMATCHED_LANGUAGE_ACTION.query:
      default:
        break;
    }
  });
  return {
    uniqueTexts: params.uniqueTexts.filter(text => !skippedTextSet.has(text)),
    sourceLangMap,
    skippedTextSet,
    fillWithOriginalTextSet
  };
}

export function planEnglishKeyGeneration(params: {
  uniqueTexts: string[];
  sourceLangMap: Map<string, string>;
  fillWithOriginalTextSet: Set<string>;
}): EnglishKeyPlan {
  const directTextSet = new Set<string>();
  const translationGroups: Record<string, string[]> = {};
  params.uniqueTexts.forEach(text => {
    const sourceLang = params.sourceLangMap.get(text) ?? "";
    if (params.fillWithOriginalTextSet.has(text) || getLangCode(sourceLang) === "en") {
      directTextSet.add(text);
      return;
    }
    translationGroups[sourceLang] ??= [];
    translationGroups[sourceLang].push(text);
  });
  return { directTextSet, translationGroups };
}
