import { getConfig } from "@/utils/config";

export const READONLY_CONFIG_KEY = "general.readonly";
export const READONLY_CONTEXT_KEY = "i18nMage.readonly";

const WRITE_COMMAND_SET = new Set<string>([
  "i18nMage.setReferredLang",
  "i18nMage.fix",
  "i18nMage.sort",
  "i18nMage.extractHardcodedTexts",
  "i18nMage.import",
  "i18nMage.importDiff",
  "i18nMage.editValue",
  "i18nMage.rewriteEntry",
  "i18nMage.deleteUnused",
  "i18nMage.markAsUsed",
  "i18nMage.unmarkAsUsed",
  "i18nMage.ignoreUndefined",
  "i18nMage.fixUndefinedEntries",
  "i18nMage.fillMissingTranslations",
  "i18nMage.pasteEntries",
  "i18nMage.addLanguage"
]);

export function isReadonlyModeEnabled() {
  return getConfig<boolean>(READONLY_CONFIG_KEY, false);
}

export function isWriteCommand(command: string) {
  return WRITE_COMMAND_SET.has(command);
}
