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
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const candidateById = useMemo(() => {
    const map = new Map<string, ExtractScanConfirmData["candidates"][number]>();
    data.candidates.forEach(item => map.set(item.id, item));
    return map;
  }, [data.candidates]);

  const toggleItem = (id: string) => {
    const candidate = candidateById.get(id);
    if (!candidate) return;
    if (addedIgnoreFiles.has(candidate.file) || addedIgnoreTexts.has(candidate.text)) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFile = (file: string, checked: boolean) => {
    if (addedIgnoreFiles.has(file)) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      const items = grouped.find(entry => entry[0] === file)?.[1] ?? [];
      for (const item of items) {
        if (addedIgnoreTexts.has(item.text)) {
          next.delete(item.id);
          continue;
        }
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  };

  const toggleFileBlacklist = (file: string) => {
    setAddedIgnoreFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  };

  const toggleTextIgnore = (text: string) => {
    setAddedIgnoreTexts(prev => {
      const next = new Set(prev);
      if (next.has(text)) {
        next.delete(text);
      } else {
        next.add(text);
      }
      return next;
    });
  };

  const toggleFileCollapsed = (file: string) => {
    setCollapsedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  useEffect(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.forEach(id => {
        const candidate = candidateById.get(id);
        if (!candidate) {
          next.delete(id);
          return;
        }
        if (addedIgnoreFiles.has(candidate.file) || addedIgnoreTexts.has(candidate.text)) {
          next.delete(id);
        }
      });
      return next;
    });
  }, [addedIgnoreFiles, addedIgnoreTexts, candidateById]);

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
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, onConfirm]);

  const selectedStats = useMemo(() => {
    const selectedItems = data.candidates.filter(item => selectedIds.has(item.id));
    const keyCount = new Set(selectedItems.map(item => item.text)).size;
    const fileCount = new Set(selectedItems.map(item => item.file)).size;
    return {
      keyCount,
      fileCount,
      languageCount: data.writeLanguages.length
    };
  }, [data.candidates, data.writeLanguages.length, selectedIds]);

  return (
    <div className="app">
      <header className="page-head">
        <h1>{t("extractScanConfirm.title")}</h1>
        <p>{t("extractScanConfirm.hint", data.candidates.length)}</p>
        <div className="summary-row">
          <span className="summary-pill">{t("extractScanConfirm.summaryKeys", selectedStats.keyCount)}</span>
          <span className="summary-pill">{t("extractScanConfirm.summaryFiles", selectedStats.fileCount)}</span>
          <span className="summary-pill">{t("extractScanConfirm.summaryLangs", selectedStats.languageCount)}</span>
        </div>
      </header>
      <main className="content">
        {grouped.map(([file, items]) => {
          const fileIgnored = addedIgnoreFiles.has(file);
          const collapsed = collapsedFiles.has(file);
          const checkedCount = items.filter(item => selectedIds.has(item.id)).length;
          const allChecked = checkedCount === items.length;
          return (
            <section className="file-card" key={file}>
              <div className="file-head">
                <label className="file-toggle">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    disabled={fileIgnored}
                    onChange={e => toggleFile(file, (e.target as HTMLInputElement).checked)}
                  />
                  <span>{file}</span>
                </label>
                <div className="file-actions">
                  <span className="meta">
                    {checkedCount}/{items.length}
                  </span>
                  <button type="button" className="mini-btn ghost-btn" onClick={() => toggleFileCollapsed(file)}>
                    {collapsed ? t("preview.expand") : t("preview.collapse")}
                  </button>
                  <button type="button" className="mini-btn" onClick={() => toggleFileBlacklist(file)}>
                    {fileIgnored ? t("extractScanConfirm.removeFileFromBlacklist") : t("extractScanConfirm.addFileToBlacklist")}
                  </button>
                </div>
              </div>
              <div className={`rows${collapsed ? " is-collapsed" : ""}`}>
                {items.map(item => {
                  const textIgnored = addedIgnoreTexts.has(item.text);
                  const itemDisabled = fileIgnored || textIgnored;
                  return (
                    <div className="row" key={item.id}>
                      <label className="row-main">
                        <input
                          type="checkbox"
                          disabled={itemDisabled}
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                        />
                        <code>{item.text}</code>
                      </label>
                      <button type="button" className="mini-btn" onClick={() => toggleTextIgnore(item.text)}>
                        {textIgnored ? t("extractScanConfirm.removeTextFromIgnore") : t("extractScanConfirm.addTextToIgnore")}
                      </button>
                    </div>
                  );
                })}
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
