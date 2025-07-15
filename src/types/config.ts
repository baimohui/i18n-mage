export const I18N_FRAMEWORK = {
  none: "none",
  vueI18n: "vue-i18n",
  reactI18next: "react-i18next",
  i18nNext: "i18next",
  vscodeL10n: "vscode-l10n"
} as const;

export type I18nFramework = (typeof I18N_FRAMEWORK)[keyof typeof I18N_FRAMEWORK];

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
