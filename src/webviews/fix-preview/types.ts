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

export type ChangeKind = "import-edit" | "fill-missing" | "new-key-and-patch" | "patch-existing-key";

export interface UnitValueChange {
  locale: string;
  before?: string;
  after: string;
  base?: string;
  selected: boolean;
}

export interface UnitPatchRef {
  id: string;
  pos: string;
  addedVars: string;
  file: string;
  index: number;
  raw: string;
  fixedRaw: string;
  fixedKey: string;
  selected: boolean;
}

export interface EntryChangeUnit {
  id: string;
  key: string;
  keyDraft: string;
  keyEditable: boolean;
  kind: ChangeKind;
  selected: boolean;
  payloadIndices: number[];
  localePayloadRefs: Record<string, number[]>;
  values: Record<string, UnitValueChange>;
  patches: UnitPatchRef[];
}
