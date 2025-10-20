import { useContext } from "preact/hooks";
import { FixPreviewContext } from "../contexts/FixPreviewContext";
import { useTranslation } from "@/webviews/shared/hooks";
import { FixPreviewData } from "../types";
import { LocaleGroup } from "./LocaleGroup";

interface Props {
  data: FixPreviewData;
}

export function ValueUpdatesSection({ data }: Props) {
  const ctx = useContext(FixPreviewContext);
  if (!ctx) return null;
  const { t } = useTranslation();
  const { updatePayloads, localeMap, baseLocale } = data;

  if (!updatePayloads.length) return null;
  const valueUpdates: Record<string, Record<string, string | undefined>> = {};
  const keyNameMap: Record<string, string> = {};
  updatePayloads.forEach(payload => {
    const { key, name, changes } = payload;
    keyNameMap[key] = name ?? key;
    for (const locale in changes) {
      if (!Object.hasOwn(valueUpdates, locale)) valueUpdates[locale] = {};
      valueUpdates[locale][key] = changes[locale].after;
    }
  });

  return (
    <div className="section value-updates">
      <h2>{t("preview.termValueUpdate")}</h2>
      {Object.entries(valueUpdates).map(([locale, entries]) => (
        <LocaleGroup key={locale} keyNameMap={keyNameMap} locale={locale} entries={entries} localeMap={localeMap} baseLocale={baseLocale} />
      ))}
    </div>
  );
}
