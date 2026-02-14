import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import { FixPreviewData, ChangeKind } from "./types";
import { getVSCodeAPI } from "../shared/utils";
import { useTranslation } from "../shared/hooks";
import { FixPreviewProvider, FixPreviewContext } from "./contexts/FixPreviewContext";

interface Props {
  data: FixPreviewData;
}

const KIND_ORDER: ChangeKind[] = ["new-key-and-patch", "patch-existing-key", "fill-missing", "import-edit"];

function buildDiff(before: string, after: string) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length - 1;
  let endAfter = after.length - 1;
  while (endBefore >= start && endAfter >= start && before[endBefore] === after[endAfter]) {
    endBefore--;
    endAfter--;
  }
  return {
    prefix: before.slice(0, start),
    removed: before.slice(start, endBefore + 1),
    added: after.slice(start, endAfter + 1),
    suffix: before.slice(endBefore + 1)
  };
}

function getKindLabel(t: (key: string, ...args: unknown[]) => string, kind: ChangeKind) {
  switch (kind) {
    case "new-key-and-patch":
      return t("preview.kindNewAndPatch");
    case "patch-existing-key":
      return t("preview.kindPatchOnly");
    case "fill-missing":
      return t("preview.kindFillMissing");
    default:
      return t("preview.kindImportEdit");
  }
}

function AppInner() {
  const { t } = useTranslation();
  const vscode = useMemo(() => getVSCodeAPI(), []);
  const ctx = useContext(FixPreviewContext);
  const [kindFilter, setKindFilter] = useState<"all" | ChangeKind>("all");
  const [collapsedUnits, setCollapsedUnits] = useState<Record<string, boolean>>({});

  if (!ctx) return null;
  const { units, selectedCount, changedLocales } = ctx;

  const filteredUnits = useMemo(() => {
    const list = kindFilter === "all" ? units : units.filter(unit => unit.kind === kindFilter);
    return list.sort((a, b) => {
      const aIdx = KIND_ORDER.indexOf(a.kind);
      const bIdx = KIND_ORDER.indexOf(b.kind);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.key.localeCompare(b.key);
    });
  }, [kindFilter, units]);

  const handleApply = useCallback(() => {
    if (selectedCount === 0) return;
    const payload = ctx.exportData();
    vscode?.postMessage({
      type: "apply",
      data: payload
    });
  }, [ctx, selectedCount, vscode]);

  const handleCancel = useCallback(() => {
    vscode?.postMessage({ type: "cancel" });
  }, [vscode]);

  const toggleUnitCollapsed = useCallback((unitId: string) => {
    setCollapsedUnits(prev => ({ ...prev, [unitId]: !(prev[unitId] ?? false) }));
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
        handleApply();
      }
    },
    [handleApply]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className="app">
      <header className="page-head">
        <h1>{t("preview.confirm")}</h1>
      </header>
      <section className="filters-panel">
        <div className="filter-row">
          <div className="filter-label">{t("preview.filter")}</div>
          <select
            className="filter-select"
            value={kindFilter}
            onChange={e => setKindFilter((e.target as HTMLSelectElement).value as "all" | ChangeKind)}
          >
            <option value="all">{t("preview.filterAll")}</option>
            <option value="new-key-and-patch">{t("preview.kindNewAndPatch")}</option>
            <option value="patch-existing-key">{t("preview.kindPatchOnly")}</option>
            <option value="fill-missing">{t("preview.kindFillMissing")}</option>
            <option value="import-edit">{t("preview.kindImportEdit")}</option>
          </select>
        </div>
        {changedLocales.length > 0 ? (
          <div className="filter-row">
            <div className="filter-label">{t("preview.localeScope")}</div>
            <div className="locale-list">
              <label className="locale-item">
                <input
                  type="checkbox"
                  checked={changedLocales.every(locale => ctx.isLocaleSelected(locale))}
                  onChange={e => ctx.setAllLocalesSelected((e.target as HTMLInputElement).checked)}
                />
                <span>{t("preview.filterAll")}</span>
              </label>
              {changedLocales.map(locale => (
                <label key={locale} className="locale-item">
                  <input
                    type="checkbox"
                    checked={ctx.isLocaleSelected(locale)}
                    onChange={e => ctx.setLocaleSelected(locale, (e.target as HTMLInputElement).checked)}
                  />
                  <span>{locale}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <div className="content">
        {filteredUnits.map((unit, index) => {
          const keyValid = ctx.isUnitKeyValid(unit.id);
          const isCollapsed = collapsedUnits[unit.id] ?? false;
          const visibleValues = Object.values(unit.values).filter(value => ctx.isLocaleSelected(value.locale));
          return (
            <div key={unit.id} className={`entry-card kind-${unit.kind}`} style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}>
              <div className="entry-head">
                <input
                  type="checkbox"
                  checked={unit.selected}
                  disabled={!keyValid}
                  onChange={e => ctx.setUnitSelected(unit.id, (e.target as HTMLInputElement).checked)}
                />
                <span className={`kind-tag kind-${unit.kind}`}>{getKindLabel(t, unit.kind)}</span>
                {unit.keyEditable ? (
                  <input
                    className={`key-input${keyValid ? "" : " invalid"}`}
                    type="text"
                    aria-invalid={!keyValid}
                    value={unit.keyDraft}
                    onInput={e => ctx.setUnitKey(unit.id, (e.target as HTMLInputElement).value)}
                  />
                ) : (
                  <code className="key-code">{unit.keyDraft}</code>
                )}
                <button type="button" className="card-toggle" aria-expanded={!isCollapsed} onClick={() => toggleUnitCollapsed(unit.id)}>
                  {isCollapsed ? t("preview.expand") : t("preview.collapse")}
                </button>
              </div>
              {!keyValid ? <div className="field-error">{t("preview.invalidKey")}</div> : null}

              {!isCollapsed && visibleValues.length > 0 ? (
                <div className="entry-block">
                  <div className="block-title">{t("preview.termValueUpdate")}</div>
                  <div className="group">
                    {visibleValues.map(value => {
                      const selectable = ctx.isValueSelectable(unit.id, value.locale);
                      const status = ctx.getValueStatus(unit.id, value.locale);
                      return (
                        <div key={`${unit.id}:${value.locale}`} className="item value-item">
                          <input
                            type="checkbox"
                            checked={value.selected}
                            disabled={!unit.selected || !keyValid || !selectable}
                            onChange={e => ctx.setValueSelected(unit.id, value.locale, (e.target as HTMLInputElement).checked)}
                          />
                          <label>{value.locale}</label>
                          <textarea
                            className={selectable ? "" : "invalid"}
                            rows={1}
                            value={value.after}
                            onInput={e => ctx.setValueAfter(unit.id, value.locale, (e.target as HTMLTextAreaElement).value)}
                          />
                          {status !== "ok" ? (
                            <span className={`status-badge status-${status}`}>
                              {status === "empty" ? t("preview.statusEmpty") : t("preview.statusLocaleFiltered")}
                            </span>
                          ) : null}
                          {value.before !== undefined && value.before !== "" && value.before !== value.after ? (
                            <span className="diff-inline value-hint">
                              {(() => {
                                const diff = buildDiff(value.before, value.after);
                                return (
                                  <>
                                    <span>{diff.prefix}</span>
                                    <span className="diff-removed">{diff.removed}</span>
                                    <span className="diff-added">{diff.added}</span>
                                    <span>{diff.suffix}</span>
                                  </>
                                );
                              })()}
                            </span>
                          ) : value.base !== undefined && value.base !== "" ? (
                            <span className="value-hint">{value.base}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {!isCollapsed && unit.patches.length > 0 ? (
                <div className="entry-block">
                  <div className="block-title">{t("preview.termIdPatch")}</div>
                  <div className="group">
                    {unit.patches.map(patch => (
                      <div key={`${unit.id}:${patch.file}:${patch.index}`} className="item patch-item">
                        <input
                          type="checkbox"
                          checked={patch.selected}
                          disabled={!unit.selected || !keyValid}
                          onChange={e => ctx.setPatchSelected(unit.id, patch.file, patch.index, (e.target as HTMLInputElement).checked)}
                        />
                        <label className="patch-label">
                          <strong>{patch.file}</strong>
                          <span className="patch-diff">
                            <span className="old">{patch.raw}</span>
                            <span className="patch-arrow">→</span>
                            <span className="new">{ctx.getPatchFixedRaw(unit.id, patch.file, patch.index)}</span>
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="actions">
        <span id="countDisplay">{t("preview.itemsSelected", selectedCount)}</span>
        <button id="btn-cancel" className="btn-secondary" onClick={handleCancel}>
          {t("preview.cancel")}
        </button>
        <button id="btn-apply" className="btn-primary" disabled={selectedCount === 0} onClick={handleApply}>
          {t("preview.apply")}
        </button>
      </div>
    </div>
  );
}

export function App(props: Props) {
  return (
    <FixPreviewProvider initialData={props.data}>
      <AppInner />
    </FixPreviewProvider>
  );
}
