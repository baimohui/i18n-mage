import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { resolveLangCode } from "@/utils/langKey/core";
import { getVSCodeAPI } from "@/webviews/shared/utils";
import { useTranslation } from "@/webviews/shared/hooks";
import { ExtractSetupWebviewData } from "./types";

interface Props {
  data: ExtractSetupWebviewData;
}

type Defaults = ExtractSetupWebviewData["defaults"];
type QuoteStyle = "none" | "single" | "double" | "auto";
type PreviewLanguage = "zh" | "en";

type FormState = {
  syncToWorkspaceConfig: boolean;
  framework: Defaults["framework"];
  languagePath: string;
  fileExtensionsText: string;
  vueTemplateFunctionName: string;
  vueScriptFunctionName: string;
  jsTsFunctionName: string;
  vueScriptImportLinesText: string;
  vueScriptSetupLinesText: string;
  jsTsImportLinesText: string;
  jsTsSetupLinesText: string;
  skipJsTsInjection: boolean;
  skipVueScriptInjection: boolean;
  extractScopePathsText: string;
  ignoreExtractScopePathsText: string;
  translationFileType: Defaults["translationFileType"];
  targetLanguages: string[];
  referenceLanguage: string;
  keyPrefix: Defaults["keyPrefix"];
  languageStructure: Defaults["languageStructure"];
  sortRule: Defaults["sortRule"];
  keyStrategy: Defaults["keyStrategy"];
  keyStyle: Defaults["keyStyle"];
  maxKeyLength: number | null;
  invalidKeyStrategy: Defaults["invalidKeyStrategy"];
  indentType: Defaults["indentType"];
  indentSize: number | null;
  quoteStyleForKey: Defaults["quoteStyleForKey"];
  quoteStyleForValue: Defaults["quoteStyleForValue"];
  stopWordsText: string;
  stopPrefixesText: string;
  vueTemplateIncludeAttrsText: string;
  vueTemplateExcludeAttrsText: string;
  ignoreTextsText: string;
  ignoreCallExpressionCalleesText: string;
  translationFailureStrategy: Defaults["translationFailureStrategy"];
  onlyExtractSourceLanguageText: boolean;
};

interface PreviewBranch {
  [key: string]: PreviewValue;
}

type PreviewValue = string | PreviewBranch;

const SOURCE_LANGUAGE_FILTER_CODES = new Set(["zh-CN", "zh-TW", "ja", "ko", "ru", "ar", "th", "hi", "vi"]);
const AUTO_PATH_SEGMENTS = ["src", "views", "app"];
const PREVIEW_SAMPLES = [
  { sourceZh: "文本一", sourceEn: "Text One", englishWords: ["text", "one"], pinyinWords: ["wen", "ben", "yi"] },
  { sourceZh: "文本二", sourceEn: "Text Two", englishWords: ["text", "two"], pinyinWords: ["wen", "ben", "er"] },
  {
    sourceZh: "页面标题",
    sourceEn: "Page Title",
    englishWords: ["page", "title"],
    pinyinWords: ["ye", "mian", "biao", "ti"]
  },
  {
    sourceZh: "用户名",
    sourceEn: "User Name",
    englishWords: ["user", "name"],
    pinyinWords: ["yong", "hu", "ming", "cheng"]
  },
  {
    sourceZh: "超级长的页面文本标题用于预览",
    sourceEn: "Super extremely long page text title for preview",
    englishWords: ["super", "extremely", "long", "page", "text", "title", "for", "preview"],
    pinyinWords: ["chao", "ji", "chao", "ji", "chang", "ye", "mian", "wen", "ben", "biao", "ti"]
  }
] as const;

function parseExtensions(input: string) {
  return input
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
    .map(item => (item.startsWith(".") ? item : `.${item}`));
}

function getFormValidationError(form: FormState, hasDetectedLangs: boolean, t: (key: string, ...args: unknown[]) => string) {
  const parsedExtensions = parseExtensions(form.fileExtensionsText);
  const hasVueFiles = parsedExtensions.includes(".vue");
  const hasJsTsFiles = parsedExtensions.some(item => [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"].includes(item));
  if (!hasDetectedLangs && form.languagePath.trim().length === 0) {
    return t("extractSetup.errorLanguagePathRequired");
  }
  if (!hasDetectedLangs && form.targetLanguages.length === 0) {
    return t("extractSetup.errorTargetLanguagesRequired");
  }
  if (hasJsTsFiles && form.jsTsFunctionName.trim().length === 0) {
    return `${t("extractSetup.labelJsTsFunctionName")} ${t("common.validate.required")}`;
  }
  if (hasJsTsFiles && !form.skipJsTsInjection && form.jsTsImportLinesText.trim().length === 0) {
    return `${t("extractSetup.labelJsTsImportLines")} ${t("common.validate.required")}`;
  }
  if (hasVueFiles && form.framework === "vue-i18n" && !form.skipVueScriptInjection && form.vueScriptImportLinesText.trim().length === 0) {
    return `${t("extractSetup.labelVueScriptImportLines")} ${t("common.validate.required")}`;
  }
  return "";
}

function upperFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function lowerFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function toStyledKey(words: string[], style: FormState["keyStyle"]) {
  const normalized = words.map(item => item.replace(/[^\w\d]+/g, "")).filter(Boolean);
  if (normalized.length === 0) return "text";
  if (style === "snake_case") return normalized.map(item => item.toLowerCase()).join("_");
  if (style === "kebab-case") return normalized.map(item => item.toLowerCase()).join("-");
  if (style === "PascalCase") return normalized.map(item => upperFirst(item.toLowerCase())).join("");
  if (style === "raw") return normalized.join(" ");
  return lowerFirst(normalized.map(item => upperFirst(item.toLowerCase())).join(""));
}

function getIndentUnit(indentType: FormState["indentType"], indentSize: number | null) {
  if (indentType === "tab") return "\t";
  const size = Number.isFinite(indentSize) && (indentSize ?? 0) > 0 ? Math.min(8, Math.max(1, Math.floor(indentSize as number))) : 2;
  return " ".repeat(size);
}

function quoteByStyle(value: string, quoteStyle: QuoteStyle, fallback: '"' | "'") {
  const quote = quoteStyle === "single" ? "'" : quoteStyle === "double" ? '"' : fallback;
  const escaped = value.replaceAll("\\", "\\\\").replaceAll(quote, `\\${quote}`);
  return `${quote}${escaped}${quote}`;
}

function isSafeIdentifier(value: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function normalizeStopPrefixes(input: string) {
  return input
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeStopWords(stopWordsText: string) {
  return stopWordsText
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function trimPathByStopPrefixes(pathSegments: string[], stopPrefixesText: string) {
  const stopPrefixes = normalizeStopPrefixes(stopPrefixesText);
  if (stopPrefixes.length === 0) return pathSegments;
  return pathSegments.filter(segment => {
    const normalizedSegment = segment.toLowerCase();
    return !stopPrefixes.includes(normalizedSegment);
  });
}

function sortEntryPaths(paths: string[][], sortRule: FormState["sortRule"]) {
  if (sortRule === "byKey") {
    return [...paths].sort((a, b) => a.join(".").localeCompare(b.join(".")));
  }
  return paths;
}

function generateFallbackKey(form: FormState, index: number) {
  if (form.invalidKeyStrategy === "ai") {
    const aiKeys = ["welcomeTitle", "orderSummary", "profileName", "submitButton", "pageTextOverview"];
    return aiKeys[index] ?? `semanticKey${String(index + 1).padStart(2, "0")}`;
  }
  return `appText${String(index + 1).padStart(2, "0")}`;
}

function getSampleEntries(form: FormState, previewLanguage: PreviewLanguage) {
  const stopWords = normalizeStopWords(form.stopWordsText);
  const maxLength = form.maxKeyLength ?? 40;

  return PREVIEW_SAMPLES.map((sample, index) => {
    const sourceWords = form.keyStrategy === "pinyin" ? [...sample.pinyinWords] : [...sample.englishWords];
    const filteredWords = sourceWords.filter(word => !stopWords.includes(word.toLowerCase()));
    const generatedKey = toStyledKey(filteredWords, form.keyStyle);
    const shouldFallback = generatedKey.trim().length === 0 || generatedKey.length > maxLength;
    const leafKey = shouldFallback ? generateFallbackKey(form, index) : generatedKey;
    const value = previewLanguage === "zh" ? sample.sourceZh : sample.sourceEn;
    return { leafKey, value };
  });
}

function stringifyObjectPreview(
  obj: PreviewBranch,
  options: {
    fileType: FormState["translationFileType"];
    quoteStyleForKey: FormState["quoteStyleForKey"];
    quoteStyleForValue: FormState["quoteStyleForValue"];
    indentType: FormState["indentType"];
    indentSize: number | null;
  }
) {
  const { fileType, quoteStyleForKey, quoteStyleForValue, indentType, indentSize } = options;
  const forceJsonQuote = fileType === "json";
  const indentUnit = getIndentUnit(indentType, indentSize);
  const quoteKey = (key: string) => {
    if (forceJsonQuote) return quoteByStyle(key, "double", '"');
    if (quoteStyleForKey === "none" && isSafeIdentifier(key)) return key;
    return quoteByStyle(key, quoteStyleForKey, '"');
  };
  const quoteValue = (value: string) => {
    if (forceJsonQuote) return quoteByStyle(value, "double", '"');
    return quoteByStyle(value, quoteStyleForValue, '"');
  };

  const visit = (node: PreviewValue, depth: number): string => {
    if (typeof node === "string") {
      return quoteValue(node);
    }
    const entries = Object.entries(node);
    if (entries.length === 0) return "{}";
    const pad = indentUnit.repeat(depth);
    const childPad = indentUnit.repeat(depth + 1);
    const lines = entries.map(([key, value]) => `${childPad}${quoteKey(key)}: ${visit(value, depth + 1)}`);
    return `{\n${lines.join(",\n")}\n${pad}}`;
  };

  const objectText = visit(obj, 0);
  if (fileType === "js") return `export default ${objectText}`;
  if (fileType === "ts") return `const messages = ${objectText};\n\nexport default messages;`;
  return objectText;
}

function stringifyYamlPreview(
  obj: PreviewBranch,
  options: {
    indentType: FormState["indentType"];
    indentSize: number | null;
    quoteStyleForValue: FormState["quoteStyleForValue"];
  }
) {
  const indentUnit = getIndentUnit(options.indentType, options.indentSize);
  const quoteValue = (value: string) => quoteByStyle(value, options.quoteStyleForValue, '"');

  const visit = (node: PreviewValue, depth: number): string[] => {
    if (typeof node === "string") {
      return [quoteValue(node)];
    }
    const lines: string[] = [];
    for (const [key, value] of Object.entries(node)) {
      const pad = indentUnit.repeat(depth);
      if (typeof value === "string") {
        lines.push(`${pad}${key}: ${quoteValue(value)}`);
      } else {
        lines.push(`${pad}${key}:`);
        lines.push(...visit(value, depth + 1));
      }
    }
    return lines;
  };

  return visit(obj, 0).join("\n");
}

function buildWriteRulePreview(form: FormState, previewLanguage: PreviewLanguage) {
  const pathSegments =
    form.keyPrefix === "auto-path" ? trimPathByStopPrefixes(AUTO_PATH_SEGMENTS, form.stopPrefixesText).filter(Boolean) : [];
  const sampleEntries = getSampleEntries(form, previewLanguage);
  const basePaths = sampleEntries.map(entry => [...pathSegments, entry.leafKey]);
  const sortedPaths = sortEntryPaths(basePaths, form.sortRule);
  const entryMap = new Map(basePaths.map((entryPath, index) => [entryPath.join("."), sampleEntries[index]]));

  if (form.languageStructure === "flat") {
    const flatObject: PreviewBranch = {};
    for (const entryPath of sortedPaths) {
      const item = entryMap.get(entryPath.join("."));
      if (!item) continue;
      flatObject[entryPath.join(".")] = item.value;
    }
    if (form.translationFileType === "yaml" || form.translationFileType === "yml") {
      return stringifyYamlPreview(flatObject, {
        indentType: form.indentType,
        indentSize: form.indentSize,
        quoteStyleForValue: form.quoteStyleForValue
      });
    }
    return stringifyObjectPreview(flatObject, {
      fileType: form.translationFileType,
      quoteStyleForKey: form.quoteStyleForKey,
      quoteStyleForValue: form.quoteStyleForValue,
      indentType: form.indentType,
      indentSize: form.indentSize
    });
  }

  const nestedObject: PreviewBranch = {};
  for (const entryPath of sortedPaths) {
    const item = entryMap.get(entryPath.join("."));
    if (!item) continue;
    let cursor: PreviewBranch = nestedObject;
    for (let i = 0; i < entryPath.length; i++) {
      const segment = entryPath[i];
      const isLeaf = i === entryPath.length - 1;
      if (isLeaf) {
        cursor[segment] = item.value;
      } else {
        const next = cursor[segment];
        if (typeof next !== "object" || next === null) {
          const created: PreviewBranch = {};
          cursor[segment] = created;
          cursor = created;
        } else {
          cursor = next;
        }
      }
    }
  }

  if (form.translationFileType === "yaml" || form.translationFileType === "yml") {
    return stringifyYamlPreview(nestedObject, {
      indentType: form.indentType,
      indentSize: form.indentSize,
      quoteStyleForValue: form.quoteStyleForValue
    });
  }
  return stringifyObjectPreview(nestedObject, {
    fileType: form.translationFileType,
    quoteStyleForKey: form.quoteStyleForKey,
    quoteStyleForValue: form.quoteStyleForValue,
    indentType: form.indentType,
    indentSize: form.indentSize
  });
}

function getRuleBadges(form: FormState, t: (key: string) => string) {
  const keyStyleKeyMap: Record<FormState["keyStyle"], string> = {
    camelCase: "camelCase",
    PascalCase: "pascalCase",
    snake_case: "snakeCase",
    "kebab-case": "kebabCase",
    raw: "raw"
  };
  const fallbackLabel = form.invalidKeyStrategy === "ai" ? t("extractSetup.badgeFallbackAi") : t("extractSetup.badgeFallbackDefault");
  return [
    `${t("extractSetup.labelFileType")}: ${t(`extractSetup.option.fileType.${form.translationFileType}`)}`,
    `${t("extractSetup.labelLanguageStructure")}: ${t(`extractSetup.option.languageStructure.${form.languageStructure}`)}`,
    `${t("extractSetup.labelKeyPrefix")}: ${t(`extractSetup.option.keyPrefix.${form.keyPrefix === "auto-path" ? "autoPath" : "none"}`)}`,
    `${t("extractSetup.labelSortRule")}: ${t(`extractSetup.option.sortRule.${form.sortRule}`)}`,
    `${t("extractSetup.labelKeyStrategy")}: ${t(`extractSetup.option.keyStrategy.${form.keyStrategy}`)}`,
    `${t("extractSetup.labelKeyStyle")}: ${t(`extractSetup.option.keyStyle.${keyStyleKeyMap[form.keyStyle]}`)}`,
    `${t("extractSetup.labelInvalidKeyStrategy")}: ${fallbackLabel}`,
    `${t("extractSetup.labelMaxKeyLength")}: ${form.maxKeyLength ?? 40}`
  ];
}

function toInitialState(data: ExtractSetupWebviewData): FormState {
  const d = data.defaults;
  const normalizedIndentType = d.indentType === "auto" ? "space" : d.indentType;
  const normalizedQuoteStyleForKey = d.quoteStyleForKey === "auto" ? "double" : d.quoteStyleForKey;
  const normalizedQuoteStyleForValue = d.quoteStyleForValue === "auto" ? "double" : d.quoteStyleForValue;
  const initial: FormState = {
    syncToWorkspaceConfig: false,
    framework: d.framework,
    languagePath: d.languagePath,
    fileExtensionsText: d.fileExtensions.join(", "),
    vueTemplateFunctionName: d.vueTemplateFunctionName,
    vueScriptFunctionName: d.vueScriptFunctionName,
    jsTsFunctionName: d.jsTsFunctionName,
    vueScriptImportLinesText: d.vueScriptImportLines.join("\n"),
    vueScriptSetupLinesText: d.vueScriptSetupLines.join("\n"),
    jsTsImportLinesText: d.jsTsImportLines.join("\n"),
    jsTsSetupLinesText: d.jsTsSetupLines.join("\n"),
    skipJsTsInjection: d.skipJsTsInjection,
    skipVueScriptInjection: d.skipVueScriptInjection,
    extractScopePathsText: d.extractScopePaths.join(", "),
    ignoreExtractScopePathsText: d.ignoreExtractScopePaths.join(", "),
    translationFileType: d.translationFileType,
    targetLanguages: d.targetLanguages,
    referenceLanguage: d.referenceLanguage,
    keyPrefix: d.keyPrefix,
    languageStructure: d.languageStructure,
    sortRule: d.sortRule,
    keyStrategy: d.keyStrategy,
    keyStyle: d.keyStyle,
    maxKeyLength: d.maxKeyLength,
    invalidKeyStrategy: d.invalidKeyStrategy,
    indentType: normalizedIndentType,
    indentSize: d.indentSize,
    quoteStyleForKey: normalizedQuoteStyleForKey,
    quoteStyleForValue: normalizedQuoteStyleForValue,
    stopWordsText: d.stopWords.join(", "),
    stopPrefixesText: d.stopPrefixes.join(", "),
    vueTemplateIncludeAttrsText: d.vueTemplateIncludeAttrs.join(", "),
    vueTemplateExcludeAttrsText: d.vueTemplateExcludeAttrs.join(", "),
    ignoreTextsText: d.ignoreTexts.join(", "),
    ignoreCallExpressionCalleesText: d.ignoreCallExpressionCallees.join(", "),
    translationFailureStrategy: d.translationFailureStrategy,
    onlyExtractSourceLanguageText: d.onlyExtractSourceLanguageText
  };
  const initialError = getFormValidationError(initial, data.hasDetectedLangs, (key: string) => key);
  initial.syncToWorkspaceConfig = initialError.length > 0;
  return initial;
}

function renderOptions(t: (key: string) => string, options: Array<{ value: string; key: string }>) {
  return options.map(option => (
    <option key={option.value} value={option.value}>
      {t(option.key)}
    </option>
  ));
}

function TargetLanguagePicker(props: {
  selected: string[];
  options: Array<{ code: string; label: string }>;
  onToggle: (code: string) => void;
  t: (key: string) => string;
}) {
  const { selected, options, onToggle, t } = props;
  return (
    <div className="lang-picker">
      <div className="lang-summary">{selected.join(", ") || t("extractSetup.targetLanguagesEmpty")}</div>
      <div className="lang-grid">
        {options.map(option => (
          <label key={option.code} className="lang-item">
            <input type="checkbox" checked={selected.includes(option.code)} onChange={() => onToggle(option.code)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function FieldSection(props: {
  form: FormState;
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  toggleTargetLanguage: (code: string) => void;
  t: (key: string, ...args: unknown[]) => string;
  availableLanguages: Array<{ code: string; label: string }>;
}) {
  const { form, update, toggleTargetLanguage, t, availableLanguages } = props;
  const extensions = useMemo(() => parseExtensions(form.fileExtensionsText), [form.fileExtensionsText]);
  const hasVueFiles = extensions.includes(".vue");
  const hasJsTsFiles = extensions.some(item => [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"].includes(item));
  const showVueFunctions = hasVueFiles && form.framework === "vue-i18n";
  const jsImportPlaceholder = "import { useI18n } from '@/i18n';";
  const jsSetupPlaceholder = "const { t } = useI18n();";
  const vueImportPlaceholder = "import { useI18n } from 'vue-i18n';";
  const vueSetupPlaceholder = "const { t } = useI18n();";
  const [previewLanguage, setPreviewLanguage] = useState<PreviewLanguage>("zh");
  const previewText = useMemo(() => buildWriteRulePreview(form, previewLanguage), [form, previewLanguage]);
  const ruleBadges = useMemo(() => getRuleBadges(form, t), [form, t]);

  return (
    <>
      <section className="entry-card">
        <h3>{t("extractSetup.sectionProject")}</h3>
        <div className="grid">
          <label>{t("extractSetup.labelFramework")}</label>
          <select value={form.framework} onChange={e => update("framework", (e.target as HTMLSelectElement).value)}>
            {renderOptions(t, [
              { value: "none", key: "extractSetup.option.framework.none" },
              { value: "vue-i18n", key: "extractSetup.option.framework.vueI18n" },
              { value: "react-i18next", key: "extractSetup.option.framework.reactI18next" },
              { value: "i18next", key: "extractSetup.option.framework.i18next" },
              { value: "vscode-l10n", key: "extractSetup.option.framework.vscodeL10n" }
            ])}
          </select>
          <label>{t("extractSetup.labelLanguagePath")}</label>
          <input value={form.languagePath} onInput={e => update("languagePath", (e.target as HTMLInputElement).value)} />
          {hasJsTsFiles ? (
            <>
              <label>{t("extractSetup.labelJsTsFunctionName")}</label>
              <input value={form.jsTsFunctionName} onInput={e => update("jsTsFunctionName", (e.target as HTMLInputElement).value)} />
              <label>{t("extractSetup.labelSkipJsTsInjection")}</label>
              <label className="inline-switch">
                <input
                  type="checkbox"
                  checked={form.skipJsTsInjection}
                  onChange={e => update("skipJsTsInjection", (e.target as HTMLInputElement).checked)}
                />
              </label>
              <label>{t("extractSetup.labelJsTsImportLines")}</label>
              <textarea
                rows={3}
                value={form.jsTsImportLinesText}
                placeholder={jsImportPlaceholder}
                onInput={e => update("jsTsImportLinesText", (e.target as HTMLTextAreaElement).value)}
              />
              <label>{t("extractSetup.labelJsTsSetupLines")}</label>
              <textarea
                rows={3}
                value={form.jsTsSetupLinesText}
                placeholder={jsSetupPlaceholder}
                onInput={e => update("jsTsSetupLinesText", (e.target as HTMLTextAreaElement).value)}
              />
            </>
          ) : null}
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
              <label>{t("extractSetup.labelSkipVueScriptInjection")}</label>
              <label className="inline-switch">
                <input
                  type="checkbox"
                  checked={form.skipVueScriptInjection}
                  onChange={e => update("skipVueScriptInjection", (e.target as HTMLInputElement).checked)}
                />
              </label>
              <label>{t("extractSetup.labelVueScriptImportLines")}</label>
              <textarea
                rows={3}
                value={form.vueScriptImportLinesText}
                placeholder={vueImportPlaceholder}
                onInput={e => update("vueScriptImportLinesText", (e.target as HTMLTextAreaElement).value)}
              />
              <label>{t("extractSetup.labelVueScriptSetupLines")}</label>
              <textarea
                rows={3}
                value={form.vueScriptSetupLinesText}
                placeholder={vueSetupPlaceholder}
                onInput={e => update("vueScriptSetupLinesText", (e.target as HTMLTextAreaElement).value)}
              />
            </>
          ) : null}
          <label>{t("extractSetup.labelTargetLanguages")}</label>
          <TargetLanguagePicker selected={form.targetLanguages} options={availableLanguages} onToggle={toggleTargetLanguage} t={t} />
          <label>{t("extractSetup.labelReferenceLanguage")}</label>
          <input value={form.referenceLanguage} onInput={e => update("referenceLanguage", (e.target as HTMLInputElement).value)} />
        </div>
      </section>

      <section className="entry-card">
        <h3>{t("extractSetup.sectionWriteRules")}</h3>
        <div className="grid">
          <label>{t("extractSetup.labelFileType")}</label>
          <select
            value={form.translationFileType}
            onChange={e => update("translationFileType", (e.target as HTMLSelectElement).value as FormState["translationFileType"])}
          >
            {renderOptions(t, [
              { value: "json", key: "extractSetup.option.fileType.json" },
              { value: "json5", key: "extractSetup.option.fileType.json5" },
              { value: "js", key: "extractSetup.option.fileType.js" },
              { value: "ts", key: "extractSetup.option.fileType.ts" },
              { value: "yaml", key: "extractSetup.option.fileType.yaml" },
              { value: "yml", key: "extractSetup.option.fileType.yml" }
            ])}
          </select>
          <label>{t("extractSetup.labelKeyPrefix")}</label>
          <select
            value={form.keyPrefix}
            onChange={e => update("keyPrefix", (e.target as HTMLSelectElement).value as FormState["keyPrefix"])}
          >
            {renderOptions(t, [
              { value: "none", key: "extractSetup.option.keyPrefix.none" },
              { value: "auto-path", key: "extractSetup.option.keyPrefix.autoPath" }
            ])}
          </select>
          <label>{t("extractSetup.labelLanguageStructure")}</label>
          <select
            value={form.languageStructure}
            onChange={e => update("languageStructure", (e.target as HTMLSelectElement).value as FormState["languageStructure"])}
          >
            {renderOptions(t, [
              { value: "flat", key: "extractSetup.option.languageStructure.flat" },
              { value: "nested", key: "extractSetup.option.languageStructure.nested" }
            ])}
          </select>
          <label>{t("extractSetup.labelSortRule")}</label>
          <select value={form.sortRule} onChange={e => update("sortRule", (e.target as HTMLSelectElement).value as FormState["sortRule"])}>
            {renderOptions(t, [
              { value: "none", key: "extractSetup.option.sortRule.none" },
              { value: "byKey", key: "extractSetup.option.sortRule.byKey" },
              { value: "byPosition", key: "extractSetup.option.sortRule.byPosition" }
            ])}
          </select>
          <label>{t("extractSetup.labelKeyStrategy")}</label>
          <select
            value={form.keyStrategy}
            onChange={e => update("keyStrategy", (e.target as HTMLSelectElement).value as FormState["keyStrategy"])}
          >
            {renderOptions(t, [
              { value: "english", key: "extractSetup.option.keyStrategy.english" },
              { value: "pinyin", key: "extractSetup.option.keyStrategy.pinyin" }
            ])}
          </select>
          <label>{t("extractSetup.labelKeyStyle")}</label>
          <select value={form.keyStyle} onChange={e => update("keyStyle", (e.target as HTMLSelectElement).value as FormState["keyStyle"])}>
            {renderOptions(t, [
              { value: "camelCase", key: "extractSetup.option.keyStyle.camelCase" },
              { value: "PascalCase", key: "extractSetup.option.keyStyle.pascalCase" },
              { value: "snake_case", key: "extractSetup.option.keyStyle.snakeCase" },
              { value: "kebab-case", key: "extractSetup.option.keyStyle.kebabCase" },
              { value: "raw", key: "extractSetup.option.keyStyle.raw" }
            ])}
          </select>
          <label>{t("extractSetup.labelMaxKeyLength")}</label>
          <input
            type="number"
            value={form.maxKeyLength ?? ""}
            onInput={e => update("maxKeyLength", Number((e.target as HTMLInputElement).value))}
          />
          <label>{t("extractSetup.labelInvalidKeyStrategy")}</label>
          <select
            value={form.invalidKeyStrategy}
            onChange={e => update("invalidKeyStrategy", (e.target as HTMLSelectElement).value as FormState["invalidKeyStrategy"])}
          >
            {renderOptions(t, [
              { value: "fallback", key: "extractSetup.option.invalidKeyStrategy.fileTextNumberFallback" },
              { value: "ai", key: "extractSetup.option.invalidKeyStrategy.ai" }
            ])}
          </select>
          <label>{t("extractSetup.labelIndentType")}</label>
          <select
            value={form.indentType}
            onChange={e => update("indentType", (e.target as HTMLSelectElement).value as FormState["indentType"])}
          >
            {renderOptions(t, [
              { value: "space", key: "extractSetup.option.indentType.space" },
              { value: "tab", key: "extractSetup.option.indentType.tab" }
            ])}
          </select>
          <label>{t("extractSetup.labelIndentSize")}</label>
          <input
            type="number"
            value={form.indentSize ?? ""}
            onInput={e => update("indentSize", Number((e.target as HTMLInputElement).value))}
          />
          <label>{t("extractSetup.labelQuoteStyleKey")}</label>
          <select
            value={form.quoteStyleForKey}
            onChange={e => update("quoteStyleForKey", (e.target as HTMLSelectElement).value as FormState["quoteStyleForKey"])}
          >
            {renderOptions(t, [
              { value: "none", key: "extractSetup.option.quoteStyleKey.none" },
              { value: "single", key: "extractSetup.option.quoteStyle.single" },
              { value: "double", key: "extractSetup.option.quoteStyle.double" }
            ])}
          </select>
          <label>{t("extractSetup.labelQuoteStyleValue")}</label>
          <select
            value={form.quoteStyleForValue}
            onChange={e => update("quoteStyleForValue", (e.target as HTMLSelectElement).value as FormState["quoteStyleForValue"])}
          >
            {renderOptions(t, [
              { value: "single", key: "extractSetup.option.quoteStyle.single" },
              { value: "double", key: "extractSetup.option.quoteStyle.double" }
            ])}
          </select>
          <label>{t("extractSetup.labelStopWords")}</label>
          <input value={form.stopWordsText} onInput={e => update("stopWordsText", (e.target as HTMLInputElement).value)} />
          <label>{t("extractSetup.labelStopPrefixes")}</label>
          <input value={form.stopPrefixesText} onInput={e => update("stopPrefixesText", (e.target as HTMLInputElement).value)} />
        </div>
        <div className="preview-box">
          <div className="preview-head">
            <strong>{t("extractSetup.previewTitle")}</strong>
            <span>{t("extractSetup.previewHint")}</span>
          </div>
          <div className="preview-tools">
            <div className="preview-lang-toggle" role="tablist" aria-label={t("extractSetup.previewLangToggle")}>
              <button type="button" className={previewLanguage === "zh" ? "active" : ""} onClick={() => setPreviewLanguage("zh")}>
                {t("extractSetup.previewLangZh")}
              </button>
              <button type="button" className={previewLanguage === "en" ? "active" : ""} onClick={() => setPreviewLanguage("en")}>
                {t("extractSetup.previewLangEn")}
              </button>
            </div>
            <div className="badge-list">
              {ruleBadges.map(item => (
                <span key={item} className="rule-badge">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <pre className="preview-code">{previewText}</pre>
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
  const extensions = useMemo(() => parseExtensions(form.fileExtensionsText), [form.fileExtensionsText]);
  const hasVueFiles = extensions.includes(".vue");
  const hasJsTsFiles = extensions.some(item => [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"].includes(item));
  const showVueFunctions = hasVueFiles && form.framework === "vue-i18n";
  const jsImportPlaceholder = "import { useI18n } from '@/i18n';";
  const jsSetupPlaceholder = "const { t } = useI18n();";
  const vueImportPlaceholder = "import { useI18n } from 'vue-i18n';";
  const vueSetupPlaceholder = "const { t } = useI18n();";
  return (
    <section className="entry-card">
      <h3>{t("extractSetup.sectionProject")}</h3>
      <div className="grid">
        {hasJsTsFiles ? (
          <>
            <label>{t("extractSetup.labelJsTsFunctionName")}</label>
            <input value={form.jsTsFunctionName} onInput={e => update("jsTsFunctionName", (e.target as HTMLInputElement).value)} />
            <label>{t("extractSetup.labelSkipJsTsInjection")}</label>
            <label className="inline-switch">
              <input
                type="checkbox"
                checked={form.skipJsTsInjection}
                onChange={e => update("skipJsTsInjection", (e.target as HTMLInputElement).checked)}
              />
            </label>
            <label>{t("extractSetup.labelJsTsImportLines")}</label>
            <textarea
              rows={3}
              value={form.jsTsImportLinesText}
              placeholder={jsImportPlaceholder}
              onInput={e => update("jsTsImportLinesText", (e.target as HTMLTextAreaElement).value)}
            />
            <label>{t("extractSetup.labelJsTsSetupLines")}</label>
            <textarea
              rows={3}
              value={form.jsTsSetupLinesText}
              placeholder={jsSetupPlaceholder}
              onInput={e => update("jsTsSetupLinesText", (e.target as HTMLTextAreaElement).value)}
            />
          </>
        ) : null}
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
            <label>{t("extractSetup.labelSkipVueScriptInjection")}</label>
            <label className="inline-switch">
              <input
                type="checkbox"
                checked={form.skipVueScriptInjection}
                onChange={e => update("skipVueScriptInjection", (e.target as HTMLInputElement).checked)}
              />
            </label>
            <label>{t("extractSetup.labelVueScriptImportLines")}</label>
            <textarea
              rows={3}
              value={form.vueScriptImportLinesText}
              placeholder={vueImportPlaceholder}
              onInput={e => update("vueScriptImportLinesText", (e.target as HTMLTextAreaElement).value)}
            />
            <label>{t("extractSetup.labelVueScriptSetupLines")}</label>
            <textarea
              rows={3}
              value={form.vueScriptSetupLinesText}
              placeholder={vueSetupPlaceholder}
              onInput={e => update("vueScriptSetupLinesText", (e.target as HTMLTextAreaElement).value)}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}

export function App({ data }: Props) {
  const vscode = useMemo(() => getVSCodeAPI(), []);
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(() => toInitialState(data));
  const [error, setError] = useState("");

  const supportsSourceLanguageFilter = useMemo(() => {
    const code = resolveLangCode(form.referenceLanguage, "google", data.langAliasCustomMappings);
    return code !== null && SOURCE_LANGUAGE_FILTER_CODES.has(code);
  }, [data.langAliasCustomMappings, form.referenceLanguage]);
  const parsedExtensions = useMemo(() => parseExtensions(form.fileExtensionsText), [form.fileExtensionsText]);
  const hasVueFiles = parsedExtensions.includes(".vue");
  const showVueTemplateAttrsConfig = form.framework === "vue-i18n" && hasVueFiles;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const toggleTargetLanguage = (code: string) => {
    setForm(prev => {
      const exists = prev.targetLanguages.includes(code);
      const targetLanguages = exists ? prev.targetLanguages.filter(item => item !== code) : [...prev.targetLanguages, code];
      return { ...prev, targetLanguages };
    });
  };

  const onSave = () => {
    const validationError = getFormValidationError(form, data.hasDetectedLangs, t);
    if (validationError.length > 0) {
      setError(validationError);
      return;
    }
    setError("");
    vscode?.postMessage({ type: "save", value: form });
  };

  const onCancel = useCallback(() => {
    vscode?.postMessage({ type: "cancel" });
  }, [vscode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
        e.preventDefault();
        onSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, onSave]);

  useEffect(() => {
    const focusTarget = document.getElementById("root") ?? document.body;
    focusTarget.setAttribute("tabindex", "-1");
    focusTarget.focus();
    window.focus();
  }, []);

  return (
    <div className="app">
      <header className="page-head">
        <h1>{t("extractSetup.title")}</h1>
      </header>
      {/* <div className="hint">{t("extractSetup.hintReusable")}</div> */}
      <div className="hint">{data.hasDetectedLangs ? t("extractSetup.hintDetected") : t("extractSetup.hintUndetected")}</div>

      <main className="content">
        {!data.hasDetectedLangs ? (
          <FieldSection
            form={form}
            update={update}
            toggleTargetLanguage={toggleTargetLanguage}
            t={t}
            availableLanguages={data.availableLanguages}
          />
        ) : null}
        {data.hasDetectedLangs ? <DetectedProjectSection form={form} update={update} t={t} /> : null}

        <section className="entry-card">
          <h3>{t("extractSetup.sectionExtraction")}</h3>
          <div className="grid">
            <label>{t("extractSetup.labelFileExtensions")}</label>
            <input value={form.fileExtensionsText} onInput={e => update("fileExtensionsText", (e.target as HTMLInputElement).value)} />
            <label>{t("extractSetup.labelExtractScopePath")}</label>
            <input
              value={form.extractScopePathsText}
              onInput={e => update("extractScopePathsText", (e.target as HTMLInputElement).value)}
            />
            <label>{t("extractSetup.labelIgnoreExtractScopePaths")}</label>
            <input
              value={form.ignoreExtractScopePathsText}
              onInput={e => update("ignoreExtractScopePathsText", (e.target as HTMLInputElement).value)}
            />
            <label>{t("extractSetup.labelIgnoreTexts")}</label>
            <input value={form.ignoreTextsText} onInput={e => update("ignoreTextsText", (e.target as HTMLInputElement).value)} />
            <label>{t("extractSetup.labelIgnoreCallExpressionCallees")}</label>
            <input
              value={form.ignoreCallExpressionCalleesText}
              onInput={e => update("ignoreCallExpressionCalleesText", (e.target as HTMLInputElement).value)}
            />
            <label>{t("extractSetup.labelTranslationFailureStrategy")}</label>
            <select
              value={form.translationFailureStrategy}
              onChange={e =>
                update("translationFailureStrategy", (e.target as HTMLSelectElement).value as FormState["translationFailureStrategy"])
              }
            >
              {renderOptions(t, [
                { value: "skip", key: "extractSetup.option.translationFailureStrategy.skip" },
                { value: "fill-with-source", key: "extractSetup.option.translationFailureStrategy.fillWithSource" },
                { value: "abort", key: "extractSetup.option.translationFailureStrategy.abort" }
              ])}
            </select>
          </div>
          {supportsSourceLanguageFilter ? (
            <div className="grid switch-grid" style={{ marginTop: "8px" }}>
              <label>{t("extractSetup.labelOnlySourceLanguageText")}</label>
              <label className="inline-switch">
                <input
                  type="checkbox"
                  checked={form.onlyExtractSourceLanguageText}
                  onChange={e => update("onlyExtractSourceLanguageText", (e.target as HTMLInputElement).checked)}
                />
              </label>
            </div>
          ) : null}
          {showVueTemplateAttrsConfig ? (
            <div className="grid" style={{ marginTop: "10px" }}>
              <label>{t("extractSetup.labelVueTemplateIncludeAttrs")}</label>
              <input
                value={form.vueTemplateIncludeAttrsText}
                onInput={e => update("vueTemplateIncludeAttrsText", (e.target as HTMLInputElement).value)}
              />
              <label>{t("extractSetup.labelVueTemplateExcludeAttrs")}</label>
              <input
                value={form.vueTemplateExcludeAttrsText}
                onInput={e => update("vueTemplateExcludeAttrsText", (e.target as HTMLInputElement).value)}
              />
            </div>
          ) : null}
        </section>
      </main>

      <footer className="actions">
        <label className="sync-option">
          <input
            type="checkbox"
            checked={form.syncToWorkspaceConfig}
            onChange={e => update("syncToWorkspaceConfig", (e.target as HTMLInputElement).checked)}
          />
          <span>{t("extractSetup.labelSyncToWorkspaceConfig")}</span>
        </label>
        <button className="btn-secondary" onClick={onCancel}>
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
