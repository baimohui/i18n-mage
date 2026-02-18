import { FixedTEntry, I18nUpdatePayload } from "@/types";
import { EntryChangeUnit, FixPreviewData, UnitPatchRef, UnitValueChange } from "./types";

export interface ExportedPreviewData {
  updatePayloads: I18nUpdatePayload[];
  idPatches: Record<string, FixedTEntry[]>;
}

export function hasSelectableValue(value: string) {
  return value.trim().length > 0;
}

export function isValidEntryKey(key: string) {
  const text = key.trim();
  if (text.length === 0) return false;
  if (/\s/.test(text)) return false;

  let escaping = false;
  let segmentLength = 0;
  for (const ch of text) {
    if (escaping) {
      segmentLength++;
      escaping = false;
      continue;
    }
    if (ch === "\\") {
      escaping = true;
      continue;
    }
    if (ch === ".") {
      if (segmentLength === 0) return false;
      segmentLength = 0;
      continue;
    }
    segmentLength++;
  }
  if (escaping) return false;
  if (segmentLength === 0) return false;
  return true;
}

function deepClonePayloads(payloads: I18nUpdatePayload[]) {
  return JSON.parse(JSON.stringify(payloads)) as I18nUpdatePayload[];
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unescapeKey(str: string) {
  return str.replace(/\\\./g, ".").replace(/\\\\/g, "\\");
}

export function getDisplayNameFromKey(data: FixPreviewData, key: string) {
  let name = unescapeKey(key);
  const { framework, defaultNamespace } = data.displayNameConfig;
  let { namespaceSeparator } = data.displayNameConfig;
  if (framework === "i18next" || framework === "react-i18next") {
    if (namespaceSeparator !== ".") {
      namespaceSeparator = ":";
      name = name.replace(".", namespaceSeparator);
    }
    name = name.replace(new RegExp(`^${escapeRegExp(defaultNamespace)}${escapeRegExp(namespaceSeparator)}`), "");
  }
  return name;
}

export function replaceDisplayKeyInFixedRaw(fixedRaw: string, displayName: string) {
  return fixedRaw.replace(/(["'`])(?:\\.|(?!\1).)*\1/, `$1${displayName}$1`);
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
        selected: hasSelectableValue(change.after ?? "")
      };
      unit.values[locale] = existing === undefined ? valueData : { ...existing, ...valueData };
    });

    unitMap.set(key, unit);
    const displayName = payload.name ?? getDisplayNameFromKey(data, key);
    if (displayName !== "") displayNameToKey.set(displayName, key);
  });

  Object.entries(idPatches).forEach(([file, patches]) => {
    patches.forEach((patch, index) => {
      const key = patch.id;
      const fixedKey = patch.fixedKey;
      const mappedKey = displayNameToKey.get(key);
      const existing = unitMap.get(fixedKey) ?? unitMap.get(key) ?? (mappedKey !== undefined ? unitMap.get(mappedKey) : undefined);
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
        const fallbackKey = fixedKey || key;
        unitMap.set(fallbackKey, {
          id: `patch:${file}:${index}`,
          key: fallbackKey,
          keyDraft: fallbackKey,
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

export function exportPreviewData(
  initialData: FixPreviewData,
  units: EntryChangeUnit[],
  selectedLocales?: Set<string>
): ExportedPreviewData {
  const nextPayloads = deepClonePayloads(initialData.updatePayloads);
  const nextPatches: Record<string, FixedTEntry[]> = {};

  units.forEach(unit => {
    const key = unit.keyDraft.trim() || unit.key;
    const keyValid = isValidEntryKey(key);
    const displayName = getDisplayNameFromKey(initialData, key);
    const includeUnit = unit.selected && keyValid;

    unit.payloadIndices.forEach(index => {
      const payload = nextPayloads[index];
      if (payload === undefined) return;
      if (!includeUnit) return;
      payload.key = key;
    });

    Object.entries(unit.localePayloadRefs).forEach(([locale, refs]) => {
      const valueState = unit.values[locale];
      const localeAllowed = selectedLocales?.has(locale) ?? true;
      refs.forEach(index => {
        const payload = nextPayloads[index];
        if (!payload?.valueChanges) return;
        if (!includeUnit || !localeAllowed || !valueState?.selected || !hasSelectableValue(valueState.after)) {
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
        fixedRaw: replaceDisplayKeyInFixedRaw(patch.fixedRaw, displayName),
        fixedKey: displayName,
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
