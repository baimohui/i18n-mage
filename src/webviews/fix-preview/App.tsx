// src/App.tsx
import { useCallback, useMemo, useContext, useEffect } from "preact/hooks";
import { ValueUpdatesSection } from "./components/ValueUpdatesSection";
import { IdPatchesSection } from "./components/IdPatchesSection";
import { FixPreviewData } from "./types";
import { getVSCodeAPI } from "../shared/utils";
import { FixPreviewProvider, FixPreviewContext } from "./contexts/FixPreviewContext";

interface Props {
  data: FixPreviewData;
}

function AppInner({ data }: Props) {
  const vscode = useMemo(() => getVSCodeAPI(), []);
  const ctx = useContext(FixPreviewContext);

  if (!ctx) return null;
  const { updatePayloads, idPatches } = ctx;

  const handleApply = useCallback(() => {
    console.log("🚀 ~ AppInner ~ ctx:", ctx);
    console.log("🚀 ~ AppInner ~ idPatches:", idPatches);
    // if (selectedCount === 0) return;

    // 将 Set 转为数组
    const idPatchesArray: Record<string, number[]> = {};
    Object.entries(idPatches).forEach(([fileIndex, set]) => {
      if (set.size > 0) idPatchesArray[fileIndex] = Array.from(set);
    });

    vscode?.postMessage({
      type: "apply",
      data: { updatePayloads: ctx.updatePayloads, idPatches: idPatchesArray }
    });
  }, [updatePayloads, idPatches, vscode]);

  const selectedCount = useMemo(() => {
    let count = 0;
    updatePayloads.forEach(payload => {
      const { changes } = payload;
      for (const locale in changes) {
        if (changes[locale].after !== undefined) {
          count++;
        }
      }
    });
    Object.values(idPatches).forEach(set => {
      count += set.size;
    });
    return count;
    // return updatePayloads.size + Object.values(idPatches).reduce((acc, set) => acc + set.size, 0);
  }, [updatePayloads, idPatches]);

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
      <h1>预览修改内容</h1>

      <div className="content">
        <ValueUpdatesSection data={data} />
        <IdPatchesSection data={data} />
      </div>

      <div className="actions">
        <span id="countDisplay">已选择 {selectedCount} 个项目</span>
        <button id="btn-apply" disabled={selectedCount === 0} onClick={handleApply}>
          应用
        </button>
        <button id="btn-cancel" onClick={handleCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

export function App(props: Props) {
  console.log("🚀 ~ App ~ props:", props);
  return (
    <FixPreviewProvider initialData={props.data}>
      <AppInner {...props} />
    </FixPreviewProvider>
  );
}
