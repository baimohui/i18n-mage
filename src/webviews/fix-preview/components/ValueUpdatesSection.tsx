// import { I18nUpdatePayload } from "@/types";
import { FixPreviewData } from "../types";
import { LocaleGroup } from "./LocaleGroup";

interface Props {
  data: FixPreviewData;
  // onSelectionChange: (count: number) => void;
  // onValueUpdatesChange: (updatePayloads: I18nUpdatePayload[]) => void;
}

export function ValueUpdatesSection({ data }: Props) {
  const { updatePayloads, localeMap, baseLocale } = data;

  if (!updatePayloads.length) return null;
  const valueUpdates: Record<string, Record<string, string | undefined>> = {};
  updatePayloads.forEach(payload => {
    const { key, changes } = payload;
    for (const locale in changes) {
      if (!Object.hasOwn(valueUpdates, locale)) valueUpdates[locale] = {};
      valueUpdates[locale][key] = changes[locale].after;
    }
  });

  // const handleValueUpdatesChange = (locale: string, selectedKeys: Set<string>) => {
  //   onSelectionChange(selectedKeys.size);
  //   onValueUpdatesChange(
  //     updatePayloads.map(payload => {
  //       const { key, changes } = payload;
  //       const newChanges: Record<string, { before: string; after: string }> = {};
  //       if (selectedKeys.has(key)) {
  //         for (const loc in changes) {
  //           newChanges[loc] = changes[loc];
  //         }
  //       }
  //       return {
  //         ...payload,
  //         key,
  //         changes: newChanges
  //       };
  //     })
  //   );
  // };

  return (
    <div className="section value-updates">
      <h2>术语值更新</h2>
      {Object.entries(valueUpdates).map(([locale, entries]) => (
        <LocaleGroup key={locale} locale={locale} entries={entries} localeMap={localeMap} baseLocale={baseLocale} />
      ))}
    </div>
  );
}
