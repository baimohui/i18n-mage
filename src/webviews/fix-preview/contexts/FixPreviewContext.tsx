import { createContext } from "preact";
import { useMemo, useState } from "preact/hooks";
import { EntryChangeUnit, FixPreviewData } from "../types";
import { ExportedPreviewData, buildUnits, exportPreviewData } from "../model";

interface FixPreviewContextValue {
  units: EntryChangeUnit[];
  selectedCount: number;
  setUnitSelected: (id: string, checked: boolean) => void;
  setValueSelected: (id: string, locale: string, checked: boolean) => void;
  setValueAfter: (id: string, locale: string, value: string) => void;
  setPatchSelected: (id: string, file: string, index: number, checked: boolean) => void;
  setUnitKey: (id: string, key: string) => void;
  exportData: () => ExportedPreviewData;
}

export const FixPreviewContext = createContext<FixPreviewContextValue | null>(null);

export function FixPreviewProvider({ initialData, children }: { initialData: FixPreviewData; children: preact.ComponentChildren }) {
  const [units, setUnits] = useState<EntryChangeUnit[]>(() => buildUnits(initialData));

  const selectedCount = useMemo(() => {
    return units.reduce((sum, unit) => {
      if (!unit.selected) return sum;
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
        return {
          ...unit,
          values: {
            ...unit.values,
            [locale]: {
              ...unit.values[locale],
              after: value
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
        exportData
      }}
    >
      {children}
    </FixPreviewContext.Provider>
  );
}
