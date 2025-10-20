// import { I18nUpdatePayload } from "@/types";
import { useTranslation } from "@/webviews/shared/hooks";
import { FixPreviewData } from "../types";
import { LocaleGroup } from "./LocaleGroup";

interface Props {
  data: FixPreviewData;
  // onSelectionChange: (count: number) => void;
  // onValueUpdatesChange: (updatePayloads: I18nUpdatePayload[]) => void;
}

export function ValueUpdatesSection({ data }: Props) {
  const { t } = useTranslation();
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

  return (
    <div className="section value-updates">
      <h2>{t("preview.termValueUpdate")}</h2>
      {Object.entries(valueUpdates).map(([locale, entries]) => (
        <LocaleGroup key={locale} locale={locale} entries={entries} localeMap={localeMap} baseLocale={baseLocale} />
      ))}
    </div>
  );
}
