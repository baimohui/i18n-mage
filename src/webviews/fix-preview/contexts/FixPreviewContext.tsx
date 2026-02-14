import { createContext } from "preact";
import { useMemo, useState } from "preact/hooks";
import { EntryChangeUnit, FixPreviewData } from "../types";
import {
  ExportedPreviewData,
  buildUnits,
  exportPreviewData,
  getDisplayNameFromKey,
  hasSelectableValue,
  isValidEntryKey,
  replaceDisplayKeyInFixedRaw
} from "../model";

interface FixPreviewContextValue {
  units: EntryChangeUnit[];
  selectedCount: number;
  setUnitSelected: (id: string, checked: boolean) => void;
  setValueSelected: (id: string, locale: string, checked: boolean) => void;
  setValueAfter: (id: string, locale: string, value: string) => void;
  setPatchSelected: (id: string, file: string, index: number, checked: boolean) => void;
  setUnitKey: (id: string, key: string) => void;
  isUnitKeyValid: (unitId: string) => boolean;
  isValueSelectable: (unitId: string, locale: string) => boolean;
  getDisplayName: (key: string) => string;
  getPatchFixedRaw: (unitId: string, file: string, index: number) => string;
  exportData: () => ExportedPreviewData;
}

export const FixPreviewContext = createContext<FixPreviewContextValue | null>(null);

export function FixPreviewProvider({ initialData, children }: { initialData: FixPreviewData; children: preact.ComponentChildren }) {
  const [units, setUnits] = useState<EntryChangeUnit[]>(() => buildUnits(initialData));

  const selectedCount = useMemo(() => {
    return units.reduce((sum, unit) => {
      if (!unit.selected) return sum;
      const effectiveKey = unit.keyDraft.trim() || unit.key;
      if (!isValidEntryKey(effectiveKey)) return sum;
      const valueCount = Object.values(unit.values).filter(item => item.selected).length;
      const patchCount = unit.patches.filter(item => item.selected).length;
      return sum + valueCount + patchCount;
    }, 0);
  }, [units]);

  const setUnitSelected = (id: string, checked: boolean) => {
    setUnits(prev =>
      prev.map(unit => {
        if (unit.id !== id) return unit;
        return {
          ...unit,
          selected: checked
        };
      })
    );
  };

  const setValueSelected = (id: string, locale: string, checked: boolean) => {
    setUnits(prev =>
      prev.map(unit => {
        if (unit.id !== id || unit.values[locale] === undefined) return unit;
        if (checked && !hasSelectableValue(unit.values[locale].after)) return unit;
        return {
          ...unit,
          values: {
            ...unit.values,
            [locale]: {
              ...unit.values[locale],
              selected: checked
            }
          }
        };
      })
    );
  };

  const setValueAfter = (id: string, locale: string, value: string) => {
    setUnits(prev =>
      prev.map(unit => {
        if (unit.id !== id || unit.values[locale] === undefined) return unit;
        const selectable = hasSelectableValue(value);
        return {
          ...unit,
          values: {
            ...unit.values,
            [locale]: {
              ...unit.values[locale],
              after: value,
              selected: selectable ? true : false
            }
          }
        };
      })
    );
  };

  const setPatchSelected = (id: string, file: string, index: number, checked: boolean) => {
    setUnits(prev =>
      prev.map(unit => {
        if (unit.id !== id) return unit;
        return {
          ...unit,
          patches: unit.patches.map(patch => {
            if (patch.file !== file || patch.index !== index) return patch;
            return { ...patch, selected: checked };
          })
        };
      })
    );
  };

  const setUnitKey = (id: string, key: string) => {
    setUnits(prev =>
      prev.map(unit => {
        if (unit.id !== id || !unit.keyEditable) return unit;
        return { ...unit, keyDraft: key };
      })
    );
  };

  const exportData = () => {
    return exportPreviewData(initialData, units);
  };

  const isUnitKeyValid = (unitId: string) => {
    const unit = units.find(item => item.id === unitId);
    if (unit === undefined) return false;
    return isValidEntryKey(unit.keyDraft.trim() || unit.key);
  };

  const isValueSelectable = (unitId: string, locale: string) => {
    const unit = units.find(item => item.id === unitId);
    if (unit === undefined) return false;
    const value = unit.values[locale];
    if (value === undefined) return false;
    return hasSelectableValue(value.after);
  };

  const getDisplayName = (key: string) => getDisplayNameFromKey(initialData, key);

  const getPatchFixedRaw = (unitId: string, file: string, index: number) => {
    const unit = units.find(item => item.id === unitId);
    if (unit === undefined) return "";
    const patch = unit.patches.find(item => item.file === file && item.index === index);
    if (patch === undefined) return "";
    const draftKey = unit.keyDraft.trim() || unit.key;
    const displayName = getDisplayName(draftKey);
    return replaceDisplayKeyInFixedRaw(patch.fixedRaw, displayName);
  };

  return (
    <FixPreviewContext.Provider
      value={{
        units,
        selectedCount,
        setUnitSelected,
        setValueSelected,
        setValueAfter,
        setPatchSelected,
        setUnitKey,
        isUnitKeyValid,
        isValueSelectable,
        getDisplayName,
        getPatchFixedRaw,
        exportData
      }}
    >
      {children}
    </FixPreviewContext.Provider>
  );
}
