import { useMemo, useState } from "preact/hooks";
import { getVSCodeAPI } from "@/webviews/shared/utils";
import { useTranslation } from "@/webviews/shared/hooks";
import { ExtractSetupWebviewData } from "./types";

interface Props {
  data: ExtractSetupWebviewData;
}

type FormState = {
  framework: string;
  languagePath: string;
  fileExtensionsText: string;
  translationFunctionNamesText: string;
  vueTemplateFunctionName: string;
  vueScriptFunctionName: string;
  importStatement: string;
  extractScopePath: string;
  translationFileType: string;
  targetLanguagesText: string;
  referenceLanguage: string;
  keyPrefix: string;
  languageStructure: string;
  sortRule: string;
  keyStrategy: string;
  keyStyle: string;
  maxKeyLength: number | null;
  invalidKeyStrategy: string;
  indentType: string;
  indentSize: number | null;
  quoteStyleForKey: string;
  quoteStyleForValue: string;
  stopWordsText: string;
  stopPrefixesText: string;
  ignorePossibleVariables: boolean;
};

function toInitialState(data: ExtractSetupWebviewData): FormState {
  const d = data.defaults;
  return {
    framework: d.framework,
    languagePath: d.languagePath,
    fileExtensionsText: d.fileExtensions.join(", "),
    translationFunctionNamesText: d.translationFunctionNames.join(", "),
    vueTemplateFunctionName: d.vueTemplateFunctionName,
    vueScriptFunctionName: d.vueScriptFunctionName,
    importStatement: d.importStatement,
    extractScopePath: d.extractScopePath,
    translationFileType: d.translationFileType,
    targetLanguagesText: d.targetLanguages.join(", "),
    referenceLanguage: d.referenceLanguage,
    keyPrefix: d.keyPrefix,
    languageStructure: d.languageStructure,
    sortRule: d.sortRule,
    keyStrategy: d.keyStrategy,
    keyStyle: d.keyStyle,
    maxKeyLength: d.maxKeyLength,
    invalidKeyStrategy: d.invalidKeyStrategy,
    indentType: d.indentType,
    indentSize: d.indentSize,
    quoteStyleForKey: d.quoteStyleForKey,
    quoteStyleForValue: d.quoteStyleForValue,
    stopWordsText: d.stopWords.join(", "),
    stopPrefixesText: d.stopPrefixes.join(", "),
    ignorePossibleVariables: d.ignorePossibleVariables
  };
}

function FieldSection(props: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  t: (key: string, ...args: unknown[]) => string;
}) {
  const { form, update, t } = props;
  return (
    <>
      <section className="entry-card">
        <h3>{t("extractSetup.sectionProject")}</h3>
        <div className="grid">
          <label>{t("extractSetup.labelFramework")}</label>
          <select value={form.framework} onChange={e => update("framework", (e.target as HTMLSelectElement).value)}>
            <option value="none">none</option>
            <option value="auto">auto</option>
            <option value="vue-i18n">vue-i18n</option>
            <option value="react-i18next">react-i18next</option>
            <option value="i18next">i18next</option>
            <option value="vscode-l10n">vscode-l10n</option>
          </select>
          <label>{t("extractSetup.labelLanguagePath")}</label>
          <input value={form.languagePath} onInput={e => update("languagePath", (e.target as HTMLInputElement).value)} />
          <label>{t("extractSetup.labelFileExtensions")}</label>
          <input value={form.fileExtensionsText} onInput={e => update("fileExtensionsText", (e.target as HTMLInputElement).value)} />
          <label>{t("extractSetup.labelFunctionNames")}</label>
          <input
            value={form.translationFunctionNamesText}
            onInput={e => update("translationFunctionNamesText", (e.target as HTMLInputElement).value)}
          />
          <label>{t("extractSetup.labelVueTemplateFn")}</label>
          <input
            value={form.vueTemplateFunctionName}
            onInput={e => update("vueTemplateFunctionName", (e.target as HTMLInputElement).value)}
          />
          <label>{t("extractSetup.labelVueScriptFn")}</label>
          <input value={form.vueScriptFunctionName} onInput={e => update("vueScriptFunctionName", (e.target as HTMLInputElement).value)} />
          <label>{t("extractSetup.labelImportStatement")}</label>
          <input value={form.importStatement} onInput={e => update("importStatement", (e.target as HTMLInputElement).value)} />
          <label>{t("extractSetup.labelFileType")}</label>
          <select value={form.translationFileType} onChange={e => update("translationFileType", (e.target as HTMLSelectElement).value)}>
            <option value="json">json</option>
            <option value="json5">json5</option>
            <option value="js">js</option>
            <option value="ts">ts</option>
            <option value="yaml">yaml</option>
            <option value="yml">yml</option>
          </select>
          <label>{t("extractSetup.labelTargetLanguages")}</label>
          <input value={form.targetLanguagesText} onInput={e => update("targetLanguagesText", (e.target as HTMLInputElement).value)} />
          <label>{t("extractSetup.labelReferenceLanguage")}</label>
          <input value={form.referenceLanguage} onInput={e => update("referenceLanguage", (e.target as HTMLInputElement).value)} />
          <label>{t("extractSetup.labelExtractScopePath")}</label>
          <input value={form.extractScopePath} onInput={e => update("extractScopePath", (e.target as HTMLInputElement).value)} />
        </div>
      </section>

      <section className="entry-card">
        <h3>{t("extractSetup.sectionWriteRules")}</h3>
        <div className="grid">
          <label>{t("extractSetup.labelKeyPrefix")}</label>
          <select value={form.keyPrefix} onChange={e => update("keyPrefix", (e.target as HTMLSelectElement).value)}>
            <option value="none">none</option>
            <option value="auto-path">auto-path</option>
          </select>
          <label>{t("extractSetup.labelLanguageStructure")}</label>
          <select value={form.languageStructure} onChange={e => update("languageStructure", (e.target as HTMLSelectElement).value)}>
            <option value="flat">flat</option>
            <option value="nested">nested</option>
          </select>
          <label>{t("extractSetup.labelSortRule")}</label>
          <select value={form.sortRule} onChange={e => update("sortRule", (e.target as HTMLSelectElement).value)}>
            <option value="none">none</option>
            <option value="byKey">byKey</option>
            <option value="byPosition">byPosition</option>
          </select>
          <label>{t("extractSetup.labelKeyStrategy")}</label>
          <select value={form.keyStrategy} onChange={e => update("keyStrategy", (e.target as HTMLSelectElement).value)}>
            <option value="english">english</option>
            <option value="pinyin">pinyin</option>
          </select>
          <label>{t("extractSetup.labelKeyStyle")}</label>
          <select value={form.keyStyle} onChange={e => update("keyStyle", (e.target as HTMLSelectElement).value)}>
            <option value="camelCase">camelCase</option>
            <option value="PascalCase">PascalCase</option>
            <option value="snake_case">snake_case</option>
            <option value="kebab-case">kebab-case</option>
            <option value="raw">raw</option>
          </select>
          <label>{t("extractSetup.labelMaxKeyLength")}</label>
          <input
            type="number"
            value={form.maxKeyLength ?? ""}
            onInput={e => update("maxKeyLength", Number((e.target as HTMLInputElement).value))}
          />
          <label>{t("extractSetup.labelInvalidKeyStrategy")}</label>
          <select value={form.invalidKeyStrategy} onChange={e => update("invalidKeyStrategy", (e.target as HTMLSelectElement).value)}>
            <option value="fallback">fallback</option>
            <option value="ai">ai</option>
          </select>
          <label>{t("extractSetup.labelIndentType")}</label>
          <select value={form.indentType} onChange={e => update("indentType", (e.target as HTMLSelectElement).value)}>
            <option value="auto">auto</option>
            <option value="space">space</option>
            <option value="tab">tab</option>
          </select>
          <label>{t("extractSetup.labelIndentSize")}</label>
          <input
            type="number"
            value={form.indentSize ?? ""}
            onInput={e => update("indentSize", Number((e.target as HTMLInputElement).value))}
          />
          <label>{t("extractSetup.labelQuoteStyleKey")}</label>
          <select value={form.quoteStyleForKey} onChange={e => update("quoteStyleForKey", (e.target as HTMLSelectElement).value)}>
            <option value="none">none</option>
            <option value="single">single</option>
            <option value="double">double</option>
            <option value="auto">auto</option>
          </select>
          <label>{t("extractSetup.labelQuoteStyleValue")}</label>
          <select value={form.quoteStyleForValue} onChange={e => update("quoteStyleForValue", (e.target as HTMLSelectElement).value)}>
            <option value="single">single</option>
            <option value="double">double</option>
            <option value="auto">auto</option>
          </select>
          <label>{t("extractSetup.labelStopWords")}</label>
          <input value={form.stopWordsText} onInput={e => update("stopWordsText", (e.target as HTMLInputElement).value)} />
          <label>{t("extractSetup.labelStopPrefixes")}</label>
          <input value={form.stopPrefixesText} onInput={e => update("stopPrefixesText", (e.target as HTMLInputElement).value)} />
        </div>
      </section>
    </>
  );
}

function DetectedProjectSection(props: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  t: (key: string, ...args: unknown[]) => string;
}) {
  const { form, update, t } = props;
  const showVueFunctions = form.framework === "vue-i18n";
  return (
    <section className="entry-card">
      <h3>{t("extractSetup.sectionProject")}</h3>
      <div className="grid">
        <label>{t("extractSetup.labelFileExtensions")}</label>
        <input value={form.fileExtensionsText} onInput={e => update("fileExtensionsText", (e.target as HTMLInputElement).value)} />
        {showVueFunctions ? (
          <>
            <label>{t("extractSetup.labelVueTemplateFn")}</label>
            <input
              value={form.vueTemplateFunctionName}
              onInput={e => update("vueTemplateFunctionName", (e.target as HTMLInputElement).value)}
            />
            <label>{t("extractSetup.labelVueScriptFn")}</label>
            <input
              value={form.vueScriptFunctionName}
              onInput={e => update("vueScriptFunctionName", (e.target as HTMLInputElement).value)}
            />
          </>
        ) : null}
        <label>{t("extractSetup.labelImportStatement")}</label>
        <input value={form.importStatement} onInput={e => update("importStatement", (e.target as HTMLInputElement).value)} />
        <label>{t("extractSetup.labelExtractScopePath")}</label>
        <input value={form.extractScopePath} onInput={e => update("extractScopePath", (e.target as HTMLInputElement).value)} />
      </div>
    </section>
  );
}

export function App({ data }: Props) {
  const vscode = useMemo(() => getVSCodeAPI(), []);
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(() => toInitialState(data));
  const [error, setError] = useState("");

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const onSave = () => {
    if (!data.hasDetectedLangs && form.languagePath.trim().length === 0) {
      setError(t("extractSetup.errorLanguagePathRequired"));
      return;
    }
    if (form.importStatement.trim().length === 0) {
      setError(t("extractSetup.errorImportStatementRequired"));
      return;
    }
    setError("");
    vscode?.postMessage({ type: "save", value: form });
  };

  return (
    <div className="app">
      <header className="page-head">
        <h1>{t("extractSetup.title")}</h1>
      </header>
      <div className="hint">{t("extractSetup.hintReusable")}</div>
      <div className="hint">{data.hasDetectedLangs ? t("extractSetup.hintDetected") : t("extractSetup.hintUndetected")}</div>

      <main className="content">
        {!data.hasDetectedLangs ? <FieldSection form={form} update={update} t={t} /> : null}
        {data.hasDetectedLangs ? <DetectedProjectSection form={form} update={update} t={t} /> : null}

        {!data.hasDetectedLangs ? (
          <section className="entry-card">
            <h3>{t("extractSetup.sectionExtraction")}</h3>
            <div className="bool-row">
              <span>{t("extractSetup.labelIgnorePossibleVariables")}</span>
              <input
                type="checkbox"
                checked={form.ignorePossibleVariables}
                onChange={e => update("ignorePossibleVariables", (e.target as HTMLInputElement).checked)}
              />
            </div>
          </section>
        ) : null}
      </main>

      <footer className="actions">
        <button className="btn-secondary" onClick={() => vscode?.postMessage({ type: "cancel" })}>
          {t("extractSetup.cancel")}
        </button>
        <button className="btn-primary" onClick={onSave}>
          {t("extractSetup.confirm")}
        </button>
        {error ? <span className="error">{error}</span> : null}
      </footer>
    </div>
  );
}
