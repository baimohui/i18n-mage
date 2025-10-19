import { useState, useCallback, useEffect, useContext } from "preact/hooks";
import { FixPreviewContext } from "../contexts/FixPreviewContext";
// import { unescapeString, internalToDisplayName } from "@/utils/regex";

interface Props {
  itemKey: string;
  value: string | undefined;
  locale: string;
  localeMap: Record<string, Record<string, string>>;
  baseLocale: string;
  isSelected: boolean;
  onToggle: (key: string, checked: boolean) => void;
}

export function ValueItem({ itemKey, value, locale, localeMap, baseLocale, isSelected, onToggle }: Props) {
  const ctx = useContext(FixPreviewContext);
  if (!ctx) return null;
  const [inputValue, setInputValue] = useState(value ?? "");

  const handleCheckboxChange = useCallback(
    (e: Event) => {
      const target = e.target as HTMLInputElement;
      onToggle(itemKey, target.checked);
    },
    [itemKey, onToggle]
  );

  const handleInputChange = useCallback(
    (e: Event) => {
      const target = e.target as HTMLTextAreaElement;
      const newValue = target.value;
      setInputValue(newValue);

      // 自动根据输入内容更新选择状态
      const shouldBeSelected = !!newValue.trim();
      if (shouldBeSelected !== isSelected) {
        onToggle(itemKey, shouldBeSelected);
      }
    },
    [itemKey, isSelected, onToggle]
  );

  useEffect(() => {
    ctx.setValueUpdates({
      key: itemKey,
      value: isSelected ? inputValue : undefined,
      locale
    });
  }, [inputValue, isSelected]);

  // TODO
  // const displayName = internalToDisplayName(unescapeString(itemKey));
  const displayName = itemKey;
  const oldValue = localeMap[locale]?.[itemKey];
  const baseValue = localeMap[baseLocale]?.[itemKey];

  return (
    <div className="item">
      <input type="checkbox" checked={isSelected} onChange={handleCheckboxChange} disabled={!inputValue.trim()} />
      <label> {displayName} </label>
      <textarea rows={1} value={inputValue} onInput={handleInputChange} placeholder="输入新的值..." />
      {oldValue && oldValue !== inputValue ? <span className="old">{oldValue}</span> : baseValue ? <span>{baseValue}</span> : null}
    </div>
  );
}
