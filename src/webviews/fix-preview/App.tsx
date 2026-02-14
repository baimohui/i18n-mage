import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ChangeKind, EntryChangeUnit, FixPreviewData } from "./types";
import { getVSCodeAPI } from "../shared/utils";
import { useTranslation } from "../shared/hooks";
import { FixPreviewProvider, FixPreviewContext } from "./contexts/FixPreviewContext";

interface Props {
  data: FixPreviewData;
}

interface VirtualUnitMeta {
  unit: EntryChangeUnit;
  keyValid: boolean;
  isCollapsed: boolean;
  visibleValuesCount: number;
  start: number;
  height: number;
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

function estimateCardHeight(meta: Omit<VirtualUnitMeta, "start">) {
  // Virtual list uses estimated heights. Keep this close to actual DOM size to avoid large gaps.
  let height = 88;
  if (!meta.keyValid) height += 20;
  if (!meta.isCollapsed) {
    if (meta.visibleValuesCount > 0) {
      height += 26 + meta.visibleValuesCount * 52;
    }
    if (meta.unit.patches.length > 0) {
      height += 26 + meta.unit.patches.length * 52;
    }
  }
  height += 8;
  return height;
}

function AppInner() {
  const { t } = useTranslation();
  const vscode = useMemo(() => getVSCodeAPI(), []);
  const ctx = useContext(FixPreviewContext);
  const contentRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [kindFilter, setKindFilter] = useState<"all" | ChangeKind>("all");
  const [collapsedUnits, setCollapsedUnits] = useState<Record<string, boolean>>({});
  const [quickFilters, setQuickFilters] = useState({
    issuesOnly: false,
    patchesOnly: false,
    selectedOnly: false
  });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(720);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const [moreOpen, setMoreOpen] = useState(false);

  if (!ctx) return null;
  const { units, selectedCount, changedLocales } = ctx;

  const filteredUnits = useMemo(() => {
    const byType = kindFilter === "all" ? units : units.filter(unit => unit.kind === kindFilter);
    return byType
      .filter(unit => {
        if (quickFilters.selectedOnly && !unit.selected) return false;
        if (quickFilters.patchesOnly && unit.patches.length === 0) return false;
        if (quickFilters.issuesOnly) {
          const keyValid = ctx.isUnitKeyValid(unit.id);
          if (!keyValid) return true;
          const hasEmpty = Object.values(unit.values)
            .filter(value => ctx.isLocaleSelected(value.locale))
            .some(value => ctx.getValueStatus(unit.id, value.locale) === "empty");
          if (!hasEmpty) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aIdx = KIND_ORDER.indexOf(a.kind);
        const bIdx = KIND_ORDER.indexOf(b.kind);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return a.key.localeCompare(b.key);
      });
  }, [ctx, kindFilter, quickFilters, units]);

  const collapsedCount = useMemo(() => {
    return Object.values(collapsedUnits).filter(Boolean).length;
  }, [collapsedUnits]);

  const handleApply = useCallback(() => {
    if (selectedCount === 0) return;
    vscode?.postMessage({
      type: "apply",
      data: ctx.exportData()
    });
  }, [ctx, selectedCount, vscode]);

  const handleCancel = useCallback(() => {
    vscode?.postMessage({ type: "cancel" });
  }, [vscode]);

  const toggleUnitCollapsed = useCallback((unitId: string) => {
    setCollapsedUnits(prev => ({ ...prev, [unitId]: !(prev[unitId] ?? false) }));
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedUnits(Object.fromEntries(filteredUnits.map(unit => [unit.id, true])));
  }, [filteredUnits]);

  const expandAll = useCallback(() => {
    setCollapsedUnits(prev => {
      const next = { ...prev };
      filteredUnits.forEach(unit => {
        delete next[unit.id];
      });
      return next;
    });
  }, [filteredUnits]);

  const toggleQuickFilter = useCallback((key: keyof typeof quickFilters) => {
    setQuickFilters(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const measureItemHeight = useCallback((unitId: string, height: number) => {
    if (height <= 0) return;
    setMeasuredHeights(prev => {
      if (prev[unitId] === height) return prev;
      return { ...prev, [unitId]: height };
    });
  }, []);

  const handleReset = useCallback(() => {
    ctx.resetDraft();
    setKindFilter("all");
    setQuickFilters({
      issuesOnly: false,
      patchesOnly: false,
      selectedOnly: false
    });
    setCollapsedUnits({});
    setMeasuredHeights({});
    setMoreOpen(false);
  }, [ctx]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
        handleApply();
      }
      if (e.key === "Escape") {
        setMoreOpen(false);
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

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!moreOpen) return;
      const target = e.target as Node | null;
      if ((target && moreMenuRef.current?.contains(target)) ?? false) return;
      setMoreOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [moreOpen]);

  const virtual = useMemo(() => {
    const items: VirtualUnitMeta[] = [];
    let cursor = 0;
    filteredUnits.forEach(unit => {
      const keyValid = ctx.isUnitKeyValid(unit.id);
      const isCollapsed = collapsedUnits[unit.id] ?? false;
      const visibleValuesCount = Object.values(unit.values).filter(value => ctx.isLocaleSelected(value.locale)).length;
      const estimatedHeight = estimateCardHeight({ unit, keyValid, isCollapsed, visibleValuesCount, height: 0 });
      const height = measuredHeights[unit.id] ?? estimatedHeight;
      items.push({
        unit,
        keyValid,
        isCollapsed,
        visibleValuesCount,
        start: cursor,
        height
      });
      cursor += height;
    });

    const overscan = 520;
    const minY = Math.max(0, scrollTop - overscan);
    const maxY = scrollTop + viewportHeight + overscan;
    const visibleItems = items.filter(item => item.start + item.height >= minY && item.start <= maxY);

    return {
      totalHeight: Math.max(cursor, viewportHeight),
      visibleItems
    };
  }, [collapsedUnits, ctx, filteredUnits, measuredHeights, scrollTop, viewportHeight]);

  return (
    <div className="app">
      <header className="page-head">
        <h1>{t("preview.confirm")}</h1>
      </header>
      <section className="filters-panel">
        <div className="filter-row">
          <div className="filter-label">{t("preview.filter")}</div>
          <div className="filter-main">
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
            <div className="quick-filter-group" aria-label={t("preview.quickFilters")}>
              <button
                type="button"
                className={`filter-chip${quickFilters.issuesOnly ? " active" : ""}`}
                onClick={() => toggleQuickFilter("issuesOnly")}
              >
                {t("preview.quickIssues")}
              </button>
              <button
                type="button"
                className={`filter-chip${quickFilters.patchesOnly ? " active" : ""}`}
                onClick={() => toggleQuickFilter("patchesOnly")}
              >
                {t("preview.quickPatches")}
              </button>
              <button
                type="button"
                className={`filter-chip${quickFilters.selectedOnly ? " active" : ""}`}
                onClick={() => toggleQuickFilter("selectedOnly")}
              >
                {t("preview.quickSelected")}
              </button>
            </div>
            <div className={`view-controls${moreOpen ? " open" : ""}`} aria-label={t("preview.viewControls")} ref={moreMenuRef}>
              <button
                type="button"
                className="filter-chip ghost more-trigger"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(prev => !prev)}
              >
                {t("preview.more")}
              </button>
              {moreOpen ? (
                <div className="more-menu">
                  <button type="button" className="filter-chip ghost" onClick={handleReset}>
                    {t("preview.resetDraft")}
                  </button>
                  <button
                    type="button"
                    className="filter-chip ghost"
                    onClick={() => {
                      expandAll();
                      setMoreOpen(false);
                    }}
                  >
                    {t("preview.expandAll")}
                  </button>
                  <button
                    type="button"
                    className="filter-chip ghost"
                    onClick={() => {
                      collapseAll();
                      setMoreOpen(false);
                    }}
                  >
                    {t("preview.collapseAll")}
                  </button>
                  <span className="view-stat">{t("preview.collapsedCount", collapsedCount, filteredUnits.length)}</span>
                </div>
              ) : null}
            </div>
          </div>
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

      <div className="content" ref={contentRef} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}>
        <div className="virtual-space" style={{ height: `${virtual.totalHeight}px` }}>
          {virtual.visibleItems.map((meta, index) => {
            const unit = meta.unit;
            const visibleValues = Object.values(unit.values).filter(value => ctx.isLocaleSelected(value.locale));
            return (
              <div
                key={unit.id}
                className="entry-virtual-item"
                style={{ top: `${meta.start}px`, animationDelay: `${Math.min(index, 10) * 40}ms` }}
                ref={node => {
                  if (!node) return;
                  measureItemHeight(unit.id, node.offsetHeight);
                }}
              >
                <div className={`entry-card kind-${unit.kind}`}>
                  <div className="entry-head">
                    <input
                      type="checkbox"
                      checked={unit.selected}
                      disabled={!meta.keyValid}
                      onChange={e => ctx.setUnitSelected(unit.id, (e.target as HTMLInputElement).checked)}
                    />
                    <span className={`kind-tag kind-${unit.kind}`}>{getKindLabel(t, unit.kind)}</span>
                    {unit.keyEditable ? (
                      <input
                        className={`key-input${meta.keyValid ? "" : " invalid"}`}
                        type="text"
                        aria-invalid={!meta.keyValid}
                        value={unit.keyDraft}
                        onInput={e => ctx.setUnitKey(unit.id, (e.target as HTMLInputElement).value)}
                      />
                    ) : (
                      <code className="key-code">{unit.keyDraft}</code>
                    )}
                    <button
                      type="button"
                      className="card-toggle"
                      aria-expanded={!meta.isCollapsed}
                      onClick={() => toggleUnitCollapsed(unit.id)}
                    >
                      {meta.isCollapsed ? t("preview.expand") : t("preview.collapse")}
                    </button>
                  </div>
                  {!meta.keyValid ? <div className="field-error">{t("preview.invalidKey")}</div> : null}

                  {!meta.isCollapsed && visibleValues.length > 0 ? (
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
                                disabled={!unit.selected || !meta.keyValid || !selectable}
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

                  {!meta.isCollapsed && unit.patches.length > 0 ? (
                    <div className="entry-block">
                      <div className="block-title">{t("preview.termIdPatch")}</div>
                      <div className="group">
                        {unit.patches.map(patch => (
                          <div key={`${unit.id}:${patch.file}:${patch.index}`} className="item patch-item">
                            <input
                              type="checkbox"
                              checked={patch.selected}
                              disabled={!unit.selected || !meta.keyValid}
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
              </div>
            );
          })}
        </div>
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
