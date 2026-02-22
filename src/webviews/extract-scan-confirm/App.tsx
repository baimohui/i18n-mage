import { useMemo, useState, useCallback, useEffect } from "preact/hooks";
import { getVSCodeAPI } from "@/webviews/shared/utils";
import { useTranslation } from "@/webviews/shared/hooks";
import { ExtractScanConfirmData } from "./types";

interface Props {
  data: ExtractScanConfirmData;
}

export function App({ data }: Props) {
  const vscode = useMemo(() => getVSCodeAPI(), []);
  const { t } = useTranslation();
  const grouped = useMemo(() => {
    const map = new Map<string, ExtractScanConfirmData["candidates"]>();
    for (const item of data.candidates) {
      const list = map.get(item.file) ?? [];
      list.push(item);
      map.set(item.file, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data.candidates]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(data.candidates.map(item => item.id)));
  const [addedIgnoreFiles, setAddedIgnoreFiles] = useState<Set<string>>(new Set());
  const [addedIgnoreTexts, setAddedIgnoreTexts] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFile = (file: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const items = grouped.find(entry => entry[0] === file)?.[1] ?? [];
      for (const item of items) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  };

  const addFileToBlacklist = (file: string) => {
    setAddedIgnoreFiles(prev => {
      const next = new Set(prev);
      next.add(file);
      return next;
    });
    toggleFile(file, false);
  };

  const addTextToIgnore = (text: string, id: string) => {
    setAddedIgnoreTexts(prev => {
      const next = new Set(prev);
      next.add(text);
      return next;
    });
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const onConfirm = useCallback(() => {
    vscode?.postMessage({
      type: "confirm",
      data: {
        selectedIds: Array.from(selectedIds),
        addedIgnoreFiles: Array.from(addedIgnoreFiles),
        addedIgnoreTexts: Array.from(addedIgnoreTexts)
      }
    });
  }, [selectedIds, addedIgnoreFiles, addedIgnoreTexts, vscode]);

  const onBack = useCallback(() => {
    vscode?.postMessage({
      type: "back",
      data: {
        addedIgnoreFiles: Array.from(addedIgnoreFiles),
        addedIgnoreTexts: Array.from(addedIgnoreTexts)
      }
    });
  }, [addedIgnoreFiles, addedIgnoreTexts, vscode]);

  const onCancel = useCallback(() => {
    vscode?.postMessage({ type: "cancel" });
  }, [vscode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="app">
      <header className="page-head">
        <h1>{t("extractScanConfirm.title")}</h1>
        <p>{t("extractScanConfirm.hint", data.candidates.length)}</p>
      </header>
      <main className="content">
        {grouped.map(([file, items]) => {
          const checkedCount = items.filter(item => selectedIds.has(item.id)).length;
          const allChecked = checkedCount === items.length;
          return (
            <section className="file-card" key={file}>
              <div className="file-head">
                <label className="file-toggle">
                  <input type="checkbox" checked={allChecked} onChange={e => toggleFile(file, (e.target as HTMLInputElement).checked)} />
                  <span>{file}</span>
                </label>
                <div className="file-actions">
                  <span className="meta">
                    {checkedCount}/{items.length}
                  </span>
                  <button type="button" className="mini-btn" disabled={addedIgnoreFiles.has(file)} onClick={() => addFileToBlacklist(file)}>
                    {addedIgnoreFiles.has(file) ? t("extractScanConfirm.added") : t("extractScanConfirm.addFileToBlacklist")}
                  </button>
                </div>
              </div>
              <div className="rows">
                {items.map(item => (
                  <div className="row" key={item.id}>
                    <label className="row-main">
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleItem(item.id)} />
                      <code>{item.text}</code>
                    </label>
                    <button
                      type="button"
                      className="mini-btn"
                      disabled={addedIgnoreTexts.has(item.text)}
                      onClick={() => addTextToIgnore(item.text, item.id)}
                    >
                      {addedIgnoreTexts.has(item.text) ? t("extractScanConfirm.added") : t("extractScanConfirm.addTextToIgnore")}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </main>
      <footer className="actions">
        <button className="btn-secondary" onClick={onCancel}>
          {t("extractSetup.cancel")}
        </button>
        <button className="btn-secondary" onClick={onBack}>
          {t("extractScanConfirm.back")}
        </button>
        <button className="btn-primary" onClick={onConfirm}>
          {t("extractScanConfirm.confirm")}
        </button>
      </footer>
    </div>
  );
}
