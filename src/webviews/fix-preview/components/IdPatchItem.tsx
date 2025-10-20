import { FixedTEntry } from "@/types";
import { FixPreviewContext } from "../contexts/FixPreviewContext";
import { useCallback, useContext, useEffect } from "preact/hooks";

interface Props {
  fileIndex: number;
  itemIndex: number;
  change: FixedTEntry;
  isSelected: boolean;
  onToggle: (index: number, checked: boolean) => void;
}

export function IdPatchItem({ fileIndex, itemIndex, change, isSelected, onToggle }: Props) {
  const ctx = useContext(FixPreviewContext);
  if (!ctx) return null;
  const handleToggle = useCallback(
    (e: Event) => {
      const target = e.target as HTMLInputElement;
      onToggle(itemIndex, target.checked);
    },
    [itemIndex, onToggle]
  );

  useEffect(() => {
    ctx.setIdPatch({ file: String(fileIndex), index: itemIndex, checked: isSelected });
  }, [isSelected]);

  return (
    <div className="item">
      <input type="checkbox" data-file={fileIndex} data-index={itemIndex} checked={isSelected} onChange={handleToggle} />
      <label>
        <span className="old">{change.raw}</span> → <span className="new">{change.fixedRaw}</span>
      </label>
    </div>
  );
}
