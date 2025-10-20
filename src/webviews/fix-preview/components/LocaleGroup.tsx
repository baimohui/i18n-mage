import { useState, useCallback } from "preact/hooks";
import { ValueItem } from "./ValueItem";

interface Props {
  locale: string;
  keyNameMap: Record<string, string>;
  entries: Record<string, string | undefined>;
  localeMap: Record<string, Record<string, string>>;
  baseLocale: string;
  // onSelectionChange: (count: number) => void;
  // onValueUpdatesChange: (locale: string, selectedKeys: Set<string>) => void;
}

export function LocaleGroup({ locale, keyNameMap, entries, localeMap, baseLocale }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set(Object.keys(entries)));

  // 全选/取消全选处理
  const allSelected = selectedItems.size === Object.keys(entries).length;

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(Object.keys(entries)));
    }
  }, [allSelected, entries]);

  const handleItemToggle = useCallback((key: string, checked: boolean) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(key);
      } else {
        newSet.delete(key);
      }
      // onSelectionChange(newSet.size);
      return newSet;
    });
  }, []);

  // 通知父组件选择变化
  // useEffect(() => {
  //   onSelectionChange(selectedItems.size);
  //   onValueUpdatesChange(locale, selectedItems);
  // }, [selectedItems.size, locale]); // 只依赖 size 而不是整个 Set

  return (
    <details open={isOpen} className="locale-group" data-locale={locale}>
      <summary className="group-head" onClick={() => setIsOpen(!isOpen)}>
        <input type="checkbox" checked={allSelected} onChange={handleToggleAll} onClick={e => e.stopPropagation()} />
        <strong> {locale} </strong>
      </summary>

      <div className="group">
        {Object.entries(entries).map(([key, value]) => (
          <ValueItem
            key={key}
            itemKey={key}
            name={keyNameMap[key]}
            value={value}
            locale={locale}
            localeMap={localeMap}
            baseLocale={baseLocale}
            isSelected={selectedItems.has(key)}
            onToggle={handleItemToggle}
          />
        ))}
      </div>
    </details>
  );
}
