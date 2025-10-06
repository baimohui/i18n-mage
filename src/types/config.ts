export const I18N_FRAMEWORK = {
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

export const I18N_FRAMEWORK_DEFAULT_CONFIG: Record<Exclude<I18nFramework, typeof I18N_FRAMEWORK.none>, I18nFrameworkConfig> = {
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
};

export type CompletionDisplayLanguageSource = (typeof COMPLETION_DISPLAY_LANGUAGE_SOURCE)[keyof typeof COMPLETION_DISPLAY_LANGUAGE_SOURCE];

export const COMPLETION_MATCH_SCOPE = {
  both: "both",
  key: "key",
  value: "value"
};

export type CompletionMatchScope = (typeof COMPLETION_MATCH_SCOPE)[keyof typeof COMPLETION_MATCH_SCOPE];
