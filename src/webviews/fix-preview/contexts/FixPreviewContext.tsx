import { createContext } from "preact";
import { useState } from "preact/hooks";
import { I18nUpdatePayload } from "@/types";
import { FixPreviewData } from "../types";

interface FixPreviewContextValue {
  selectedCount: number;
  setSelectedCount: (count: number) => void;

  updatePayloads: I18nUpdatePayload[];
  setValueUpdate: (updates: { key: string; value?: string; locale: string }) => void;

  idPatches: Record<string, Set<number>>;
  setIdPatch: (patch: { file: string; index: number; checked: boolean }) => void;
}

export const FixPreviewContext = createContext<FixPreviewContextValue | null>(null);

export function FixPreviewProvider({ initialData, children }: { initialData: FixPreviewData; children: preact.ComponentChildren }) {
  const [selectedCount, setSelectedCount] = useState(0);
  // const [valueUpdates, setValueUpdate] = useState<I18nUpdatePayload[]>([]);
  const [updatePayloads, setUpdatePayloads] = useState<I18nUpdatePayload[]>(initialData.updatePayloads);
  const [idPatches, setIdPatches] = useState<Record<string, Set<number>>>({});

  const setValueUpdate = (update: { key: string; value?: string; locale: string }) => {
    setUpdatePayloads(prevPayloads => {
      const payloads = [...prevPayloads];
      const payload = payloads.find(p => p.key === update.key);
      // if (!payload) {
      //   payload = { key: update.key, changes: {} };
      //   payloads.push(payload);
      // }
      if (payload && payload.changes) {
        payload.changes[update.locale] ??= {};
        payload.changes[update.locale].after = update.value;
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
    <FixPreviewContext.Provider value={{ selectedCount, setSelectedCount, updatePayloads, setValueUpdate, idPatches, setIdPatch }}>
      {children}
    </FixPreviewContext.Provider>
  );
}
