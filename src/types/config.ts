export const I18N_FRAMEWORK = {
  auto: "auto",
  none: "none",
  vueI18n: "vue-i18n",
  reactI18next: "react-i18next",
  i18nNext: "i18next",
  vscodeL10n: "vscode-l10n"
} as const;

export type I18nFramework = (typeof I18N_FRAMEWORK)[keyof typeof I18N_FRAMEWORK];

export const NAMESPACE_STRATEGY = {
  auto: "auto",
  full: "full",
  file: "file",
  none: "none"
} as const;

export type NamespaceStrategy = (typeof NAMESPACE_STRATEGY)[keyof typeof NAMESPACE_STRATEGY];

export interface I18nFrameworkConfig {
  singleBrackets: boolean;
}

export const I18N_FRAMEWORK_DEFAULT_CONFIG: Record<
  Exclude<I18nFramework, typeof I18N_FRAMEWORK.auto | typeof I18N_FRAMEWORK.none>,
  I18nFrameworkConfig
> = {
  [I18N_FRAMEWORK.vueI18n]: {
    singleBrackets: true
  },
  [I18N_FRAMEWORK.reactI18next]: {
    singleBrackets: false
  },
  [I18N_FRAMEWORK.i18nNext]: {
    singleBrackets: false
  },
  [I18N_FRAMEWORK.vscodeL10n]: {
    singleBrackets: true
  }
} as const;

export const SORT_MODE = {
  None: "none",
  ByKey: "byKey",
  ByPosition: "byPosition"
} as const;

export type SortMode = (typeof SORT_MODE)[keyof typeof SORT_MODE];

export const KEY_STYLE = {
  camelCase: "camelCase",
  pascalCase: "PascalCase",
  snakeCase: "snake_case",
  kebabCase: "kebab-case",
  raw: "raw"
} as const;

export type KeyStyle = (typeof KEY_STYLE)[keyof typeof KEY_STYLE];

export const KEY_STRATEGY = {
  english: "english",
  pinyin: "pinyin"
} as const;

export type KeyStrategy = (typeof KEY_STRATEGY)[keyof typeof KEY_STRATEGY];

export const UNMATCHED_LANGUAGE_ACTION = {
  ignore: "ignore",
  force: "force",
  fill: "fill",
  switch: "switch",
  query: "query"
} as const;

export type UnmatchedLanguageAction = (typeof UNMATCHED_LANGUAGE_ACTION)[keyof typeof UNMATCHED_LANGUAGE_ACTION];

export const COMPLETION_DISPLAY_LANGUAGE_SOURCE = {
  source: "source",
  display: "display"
} as const;

export type CompletionDisplayLanguageSource = (typeof COMPLETION_DISPLAY_LANGUAGE_SOURCE)[keyof typeof COMPLETION_DISPLAY_LANGUAGE_SOURCE];

export const COMPLETION_MATCH_SCOPE = {
  both: "both",
  key: "key",
  value: "value"
} as const;

export type CompletionMatchScope = (typeof COMPLETION_MATCH_SCOPE)[keyof typeof COMPLETION_MATCH_SCOPE];

export const COMPLETION_PINYIN_SEARCH = {
  off: "off",
  full: "full",
  abbr: "abbr",
  both: "both"
} as const;

export type CompletionPinyinSearch = (typeof COMPLETION_PINYIN_SEARCH)[keyof typeof COMPLETION_PINYIN_SEARCH];

export const KEY_GENERATION_FILL_SCOPE = {
  minimal: "minimal",
  all: "all"
} as const;

export type KeyGenerationFillScope = (typeof KEY_GENERATION_FILL_SCOPE)[keyof typeof KEY_GENERATION_FILL_SCOPE];

export const INDENT_TYPE = {
  auto: "auto",
  space: "space",
  tab: "tab"
} as const;

export type IndentType = (typeof INDENT_TYPE)[keyof typeof INDENT_TYPE];

export const INLINE_HINTS_DISPLAY_MODE = {
  overlay: "overlay",
  inline: "inline"
} as const;

export type InlineHintsDisplayMode = (typeof INLINE_HINTS_DISPLAY_MODE)[keyof typeof INLINE_HINTS_DISPLAY_MODE];

export const DECORATION_SCOPE = {
  visible: "visible",
  file: "file"
} as const;

export type DecorationScope = (typeof DECORATION_SCOPE)[keyof typeof DECORATION_SCOPE];

export const INVALID_KEY_STRATEGY = {
  fallback: "fallback",
  ai: "ai"
} as const;

export type InvalidKeyStrategy = (typeof INVALID_KEY_STRATEGY)[keyof typeof INVALID_KEY_STRATEGY];

export const LANGUAGE_STRUCTURE = {
  auto: "auto",
  nested: "nested",
  flat: "flat"
} as const;

export type LanguageStructure = (typeof LANGUAGE_STRUCTURE)[keyof typeof LANGUAGE_STRUCTURE];

export const QUOTE_STYLE_4_KEY = {
  none: "none",
  single: "single",
  double: "double",
  auto: "auto"
} as const;

export type QuoteStyle4Key = (typeof QUOTE_STYLE_4_KEY)[keyof typeof QUOTE_STYLE_4_KEY];

export const QUOTE_STYLE_4_VALUE = {
  single: "single",
  double: "double",
  auto: "auto"
} as const;

export type QuoteStyle4Value = (typeof QUOTE_STYLE_4_VALUE)[keyof typeof QUOTE_STYLE_4_VALUE];

export const ACCESS_MODE = {
  function: "function",
  object: "object"
} as const;

export type AccessMode = (typeof ACCESS_MODE)[keyof typeof ACCESS_MODE];
