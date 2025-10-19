import { FixedTEntry, I18nUpdatePayload } from "@/types";

export type EntryValueUpdates = Record<string, Record<string, string | undefined>>;
export type EntryIdPatches = Record<string, FixedTEntry[]>;
export type LocaleMap = Record<string, Record<string, string>>;

export interface FixPreviewData {
  updatePayloads: I18nUpdatePayload[];
  idPatches: EntryIdPatches;
  localeMap: LocaleMap;
  baseLocale: string;
}

export interface CheckboxState {
  [key: string]: boolean;
}
