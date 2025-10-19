import { createContext } from "preact";
import { useState } from "preact/hooks";
import { I18nUpdatePayload } from "@/types";
import { FixPreviewData } from "../types";

interface FixPreviewContextValue {
  selectedCount: number;
  setSelectedCount: (count: number) => void;

  updatePayloads: I18nUpdatePayload[];
  setValueUpdates: (updates: { key: string; value?: string; locale: string }) => void;

  idPatches: Record<string, Set<number>>;
  setIdPatches: (patches: Record<string, Set<number>>) => void;
}

export const FixPreviewContext = createContext<FixPreviewContextValue | null>(null);

export function FixPreviewProvider({ initialData, children }: { initialData: FixPreviewData; children: preact.ComponentChildren }) {
  const [selectedCount, setSelectedCount] = useState(0);
  // const [valueUpdates, setValueUpdates] = useState<I18nUpdatePayload[]>([]);
  const [updatePayloads, setUpdatePayloads] = useState<I18nUpdatePayload[]>(initialData.updatePayloads);
  const [idPatches, setIdPatches] = useState<Record<string, Set<number>>>({});

  const setValueUpdates = (update: { key: string; value?: string; locale: string }) => {
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
        console.log("🚀 ~ setValueUpdates ~ update.value:", update.value);
      }
      console.log("🚀 ~ setValueUpdates ~ payload:", payload);
      console.log("🚀 ~ setValueUpdates ~ payloads:", payloads);
      return payloads;
    });
  };

  return (
    <FixPreviewContext.Provider value={{ selectedCount, setSelectedCount, updatePayloads, setValueUpdates, idPatches, setIdPatches }}>
      {children}
    </FixPreviewContext.Provider>
  );
}
