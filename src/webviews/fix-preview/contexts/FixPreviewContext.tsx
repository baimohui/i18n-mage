import { createContext } from "preact";
import { useState } from "preact/hooks";
import { I18nUpdatePayload } from "@/types";
import { FixPreviewData } from "../types";

interface FixPreviewContextValue {
  updatePayloads: I18nUpdatePayload[];
  setValueUpdate: (updates: { key: string; value?: string; locale: string }) => void;

  idPatches: Record<string, Set<number>>;
  setIdPatch: (patch: { file: string; index: number; checked: boolean }) => void;

  keyNameMap: Record<string, string>;
  setKeyNameMap: (map: Record<string, string>) => void;
}

export const FixPreviewContext = createContext<FixPreviewContextValue | null>(null);

export function FixPreviewProvider({ initialData, children }: { initialData: FixPreviewData; children: preact.ComponentChildren }) {
  const [updatePayloads, setUpdatePayloads] = useState<I18nUpdatePayload[]>(initialData.updatePayloads);
  const [idPatches, setIdPatches] = useState<Record<string, Set<number>>>({});
  const [keyNameMap, setKeyNameMap] = useState<Record<string, string>>({});

  const setValueUpdate = (update: { key: string; value?: string; locale: string }) => {
    setUpdatePayloads(prevPayloads => {
      const payloads = [...prevPayloads];
      for (const payload of payloads) {
        if (payload.key === update.key && payload.valueChanges && Object.hasOwn(payload.valueChanges, update.locale)) {
          payload.valueChanges[update.locale].after = update.value ?? "";
        }
      }
      return payloads;
    });
  };

  const setIdPatch = (update: { file: string; index: number; checked: boolean }) => {
    setIdPatches(prevPatches => {
      const patches = { ...prevPatches };
      patches[update.file] ??= new Set<number>();
      if (update.checked) {
        patches[update.file].add(update.index);
      } else {
        patches[update.file].delete(update.index);
      }
      return patches;
    });
  };

  return (
    <FixPreviewContext.Provider value={{ updatePayloads, setValueUpdate, idPatches, setIdPatch, keyNameMap, setKeyNameMap }}>
      {children}
    </FixPreviewContext.Provider>
  );
}
