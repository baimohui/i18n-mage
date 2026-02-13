import { FixedTEntry, I18nUpdatePayload } from "@/types";
import { EntryChangeUnit, FixPreviewData, UnitPatchRef, UnitValueChange } from "./types";

export interface ExportedPreviewData {
  updatePayloads: I18nUpdatePayload[];
  idPatches: Record<string, FixedTEntry[]>;
}

function deepClonePayloads(payloads: I18nUpdatePayload[]) {
  return JSON.parse(JSON.stringify(payloads)) as I18nUpdatePayload[];
}

function replaceDisplayKeyInFixedRaw(fixedRaw: string, key: string) {
  return fixedRaw.replace(/(["'`])(?:\\.|(?!\1).)*\1/, `$1${key}$1`);
}

function classifyKind(hasAdd: boolean, hasFill: boolean, hasPatch: boolean) {
  if (hasAdd && hasPatch) return "new-key-and-patch" as const;
  if (!hasAdd && hasPatch) return "patch-existing-key" as const;
  if (hasFill) return "fill-missing" as const;
  return "import-edit" as const;
}

export function buildUnits(data: FixPreviewData) {
  const updatePayloads = data.updatePayloads;
  const idPatches = data.idPatches;
  const unitMap = new Map<string, EntryChangeUnit>();
  const displayNameToKey = new Map<string, string>();

  updatePayloads.forEach((payload, payloadIndex) => {
    const key = payload.key;
    const unit = unitMap.get(key) ?? {
      id: `key:${key}`,
      key,
      keyDraft: key,
      keyEditable: false,
      kind: "import-edit",
      selected: true,
      payloadIndices: [],
      localePayloadRefs: {},
      values: {},
      patches: []
    };

    unit.payloadIndices.push(payloadIndex);
    const valueChanges = payload.valueChanges ?? {};
    Object.entries(valueChanges).forEach(([locale, change]) => {
      unit.localePayloadRefs[locale] ??= [];
      unit.localePayloadRefs[locale].push(payloadIndex);

      const oldValue = data.localeMap[locale]?.[key];
      const baseValue = data.localeMap[data.baseLocale]?.[key];
      const existing = unit.values[locale];
      const valueData: UnitValueChange = {
        locale,
        before: change.before ?? oldValue,
        after: change.after ?? "",
        base: baseValue,
        selected: true
      };
      unit.values[locale] = existing === undefined ? valueData : { ...existing, ...valueData };
    });

    unitMap.set(key, unit);
    if (payload.name !== undefined && payload.name !== "") {
      displayNameToKey.set(payload.name, key);
    }
  });

  Object.entries(idPatches).forEach(([file, patches]) => {
    patches.forEach((patch, index) => {
      const key = patch.fixedKey;
      const mappedKey = displayNameToKey.get(key);
      const existing = unitMap.get(key) ?? (mappedKey !== undefined ? unitMap.get(mappedKey) : undefined);
      const patchData: UnitPatchRef = {
        id: patch.id,
        pos: patch.pos,
        addedVars: patch.addedVars,
        file,
        index,
        raw: patch.raw,
        fixedRaw: patch.fixedRaw,
        fixedKey: patch.fixedKey,
        selected: true
      };
      if (existing) {
        existing.patches.push(patchData);
        existing.keyEditable ||= existing.payloadIndices.some(i => updatePayloads[i]?.type === "add");
        unitMap.set(existing.key, existing);
      } else {
        unitMap.set(key, {
          id: `patch:${file}:${index}`,
          key,
          keyDraft: key,
          keyEditable: false,
          kind: "patch-existing-key",
          selected: true,
          payloadIndices: [],
          localePayloadRefs: {},
          values: {},
          patches: [patchData]
        });
      }
    });
  });

  const units = Array.from(unitMap.values()).map(unit => {
    const payloadTypes = unit.payloadIndices.map(index => updatePayloads[index]?.type);
    const hasAdd = payloadTypes.includes("add");
    const hasFill = payloadTypes.includes("fill");
    const hasPatch = unit.patches.length > 0;
    return {
      ...unit,
      keyEditable: unit.keyEditable || hasAdd,
      kind: classifyKind(hasAdd, hasFill, hasPatch)
    };
  });

  return units.sort((a, b) => {
    if (a.kind === "new-key-and-patch" && b.kind !== "new-key-and-patch") return -1;
    if (a.kind !== "new-key-and-patch" && b.kind === "new-key-and-patch") return 1;
    return a.key.localeCompare(b.key);
  });
}

export function exportPreviewData(initialData: FixPreviewData, units: EntryChangeUnit[]): ExportedPreviewData {
  const nextPayloads = deepClonePayloads(initialData.updatePayloads);
  const nextPatches: Record<string, FixedTEntry[]> = {};

  units.forEach(unit => {
    const key = unit.keyDraft.trim() || unit.key;
    const includeUnit = unit.selected;

    unit.payloadIndices.forEach(index => {
      const payload = nextPayloads[index];
      if (payload === undefined) return;
      payload.key = key;
    });

    Object.entries(unit.localePayloadRefs).forEach(([locale, refs]) => {
      const valueState = unit.values[locale];
      refs.forEach(index => {
        const payload = nextPayloads[index];
        if (!payload?.valueChanges) return;
        if (!includeUnit || !valueState?.selected) {
          delete payload.valueChanges[locale];
          return;
        }
        if (Object.hasOwn(payload.valueChanges, locale)) {
          payload.valueChanges[locale].after = valueState.after;
        }
      });
    });

    unit.patches.forEach(patch => {
      if (!includeUnit || !patch.selected) return;
      nextPatches[patch.file] ??= [];
      nextPatches[patch.file].push({
        id: patch.id,
        raw: patch.raw,
        pos: patch.pos,
        fixedRaw: replaceDisplayKeyInFixedRaw(patch.fixedRaw, key),
        fixedKey: key,
        addedVars: patch.addedVars
      });
    });
  });

  const filteredPayloads = nextPayloads.filter(payload => {
    if (payload.keyChange) return true;
    const count = Object.keys(payload.valueChanges ?? {}).length;
    return count > 0;
  });

  return { updatePayloads: filteredPayloads, idPatches: nextPatches };
}
