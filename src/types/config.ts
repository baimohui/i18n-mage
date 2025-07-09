export const I18N_FRAMEWORK = {
  none: "none",
  vueI18n: "vue-i18n",
  reactIntl: "react-intl",
  reactI18next: "react-i18next",
  i18nNext: "i18next",
  vscodeL10n: "vscode-l10n"
} as const;

export type I18nFramework = (typeof I18N_FRAMEWORK)[keyof typeof I18N_FRAMEWORK];

export const SORT_MODE = {
  None: "none",
  ByKey: "byKey",
  ByPosition: "byPosition"
} as const;

export type SortMode = (typeof SORT_MODE)[keyof typeof SORT_MODE];
