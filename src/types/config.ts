export const I18N_SOLUTION = {
  none: "none",
  vueI18n: "vue-i18n",
  reactIntl: "react-intl",
  reactI18next: "react-i18next",
  i18nNext: "i18next",
  vscodeL10n: "vscode-l10n"
} as const;

export type I18nSolution = (typeof I18N_SOLUTION)[keyof typeof I18N_SOLUTION];

export const SORT_MODE = {
  None: "none",
  ByKey: "byKey",
  ByPosition: "byPosition"
} as const;

export type SortMode = (typeof SORT_MODE)[keyof typeof SORT_MODE];
