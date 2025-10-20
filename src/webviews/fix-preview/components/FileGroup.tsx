import { useState, useCallback } from "preact/hooks";
// import { toRelativePath } from "@/utils/fs";
import { FixedTEntry } from "@/types";
import { IdPatchItem } from "./IdPatchItem";

interface Props {
  file: string;
  fileIndex: number;
  changes: FixedTEntry[];
}

export function FileGroup({ file, fileIndex, changes }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set(changes.map((_, index) => index)));

  const allSelected = selectedItems.size === changes.length;

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(changes.map((_, index) => index)));
    }
  }, [allSelected, changes]);

  const handleItemToggle = useCallback((index: number, checked: boolean) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(index);
      } else {
        newSet.delete(index);
      }
      return newSet;
    });
  }, []);

  // 通知父组件选择变化
  // useEffect(() => {
  //   onSelectionChange(selectedItems.size);
  //   onIdPatchesChange(fileIndex, selectedItems);
  // }, [selectedItems.size, fileIndex, onSelectionChange, onIdPatchesChange]);

  return (
    <details open={isOpen} data-index={fileIndex}>
      <summary className="group-head" onClick={() => setIsOpen(!isOpen)}>
        <input type="checkbox" checked={allSelected} onChange={handleToggleAll} onClick={e => e.stopPropagation()} />
        <strong>{file}</strong>
      </summary>

      <div className="group">
        {changes.map((change, index) => (
          <IdPatchItem
            key={index}
            fileIndex={fileIndex}
            itemIndex={index}
            change={change}
            isSelected={selectedItems.has(index)}
            onToggle={handleItemToggle}
          />
        ))}
      </div>
    </details>
  );
}
