import { useCallback, useContext, useEffect, useMemo, useState } from "preact/hooks";
import { FixPreviewData, ChangeKind } from "./types";
import { getVSCodeAPI } from "../shared/utils";
import { useTranslation } from "../shared/hooks";
import { FixPreviewProvider, FixPreviewContext } from "./contexts/FixPreviewContext";

interface Props {
  data: FixPreviewData;
}

const KIND_ORDER: ChangeKind[] = ["new-key-and-patch", "patch-existing-key", "fill-missing", "import-edit"];

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
      <h1>{t("preview.confirm")}</h1>
      <div className="toolbar">
        <label>{t("preview.filter")}:</label>
        <select value={kindFilter} onChange={e => setKindFilter((e.target as HTMLSelectElement).value as "all" | ChangeKind)}>
          <option value="all">{t("preview.filterAll")}</option>
          <option value="new-key-and-patch">{t("preview.kindNewAndPatch")}</option>
          <option value="patch-existing-key">{t("preview.kindPatchOnly")}</option>
          <option value="fill-missing">{t("preview.kindFillMissing")}</option>
          <option value="import-edit">{t("preview.kindImportEdit")}</option>
        </select>
      </div>
      {changedLocales.length > 0 ? (
        <div className="locale-scope">
          <div className="block-title">{t("preview.localeScope")}</div>
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

      <div className="content">
        {filteredUnits.map(unit => {
          const keyValid = ctx.isUnitKeyValid(unit.id);
          return (
            <div key={unit.id} className="entry-card">
              <div className="entry-head">
                <input
                  type="checkbox"
                  checked={unit.selected}
                  disabled={!keyValid}
                  onChange={e => ctx.setUnitSelected(unit.id, (e.target as HTMLInputElement).checked)}
                />
                <span className="kind-tag">{getKindLabel(t, unit.kind)}</span>
                {unit.keyEditable ? (
                  <input
                    className={`key-input${keyValid ? "" : " invalid"}`}
                    type="text"
                    value={unit.keyDraft}
                    onInput={e => ctx.setUnitKey(unit.id, (e.target as HTMLInputElement).value)}
                  />
                ) : (
                  <code className="key-code">{unit.keyDraft}</code>
                )}
              </div>
              {!keyValid ? <div className="field-error">{t("preview.invalidKey")}</div> : null}

              {Object.values(unit.values).length > 0 ? (
                <div className="entry-block">
                  <div className="block-title">{t("preview.termValueUpdate")}</div>
                  <div className="group">
                    {Object.values(unit.values).map(value => {
                      const selectable = ctx.isValueSelectable(unit.id, value.locale);
                      return (
                        <div key={`${unit.id}:${value.locale}`} className="item">
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
                          {value.before !== undefined && value.before !== "" && value.before !== value.after ? (
                            <span className="old">{value.before}</span>
                          ) : value.base !== undefined && value.base !== "" ? (
                            <span>{value.base}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {unit.patches.length > 0 ? (
                <div className="entry-block">
                  <div className="block-title">{t("preview.termIdPatch")}</div>
                  <div className="group">
                    {unit.patches.map(patch => (
                      <div key={`${unit.id}:${patch.file}:${patch.index}`} className="item">
                        <input
                          type="checkbox"
                          checked={patch.selected}
                          disabled={!unit.selected || !keyValid}
                          onChange={e => ctx.setPatchSelected(unit.id, patch.file, patch.index, (e.target as HTMLInputElement).checked)}
                        />
                        <label className="patch-label">
                          <strong>{patch.file}</strong>
                          <span>
                            <span className="old">{patch.raw}</span> {" -> "}{" "}
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
        <button id="btn-cancel" onClick={handleCancel}>
          {t("preview.cancel")}
        </button>
        <button id="btn-apply" disabled={selectedCount === 0} onClick={handleApply}>
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
