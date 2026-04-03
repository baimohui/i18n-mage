import fs from "fs";
import path from "path";
import { clearConfigCache, getConfig, setConfig } from "@/utils/config";
import { toRelativePath } from "@/utils/fs";
import { t } from "@/utils/i18n";
import { getLangCode } from "@/utils/langKey";

export type BootstrapRaw = Partial<ExtractBootstrapConfig> & {
  fileExtensionsText?: string;
  stopWordsText?: string;
  stopPrefixesText?: string;
  prefixCandidatesText?: string;
  targetLanguagesText?: string;
  vueTemplateIncludeAttrsText?: string;
  vueTemplateExcludeAttrsText?: string;
  extractScopePathsText?: string;
  ignoreExtractScopePathsText?: string;
  vueScriptImportLinesText?: string;
  vueScriptSetupLinesText?: string;
  jsTsImportLinesText?: string;
  jsTsSetupLinesText?: string;
  ignoreTextsText?: string;
  ignoreCallExpressionCalleesText?: string;
};

export interface ExtractBootstrapConfig {
  syncToWorkspaceConfig?: boolean;
  framework: string;
  languagePath: string;
  fileExtensions: string[];
  vueTemplateFunctionName: string;
  vueScriptFunctionName: string;
  jsTsFunctionName: string;
  vueScriptImportLines: string[];
  vueScriptSetupLines: string[];
  jsTsImportLines: string[];
  jsTsSetupLines: string[];
  skipJsTsInjection: boolean;
  skipVueScriptInjection: boolean;
  keyPrefix: "none" | "auto-path" | "ai-selection";
  prefixCandidates: string[];
  languageStructure: "flat" | "nested";
  sortRule: "none" | "byKey" | "byPosition";
  keyStrategy: "english" | "pinyin";
  keyStyle: "camelCase" | "PascalCase" | "snake_case" | "kebab-case" | "raw";
  maxKeyLength: number;
  invalidKeyStrategy: "fallback" | "ai";
  indentType: "auto" | "space" | "tab";
  indentSize: number | null;
  quoteStyleForKey: "none" | "single" | "double" | "auto";
  quoteStyleForValue: "single" | "double" | "auto";
  stopWords: string[];
  stopPrefixes: string[];
  onlyExtractSourceLanguageText: boolean;
  referenceLanguage: string;
  translationFileType: "json" | "json5" | "js" | "ts" | "yaml" | "yml";
  extractScopePaths: string[];
  ignoreExtractScopePaths: string[];
  targetLanguages: string[];
  vueTemplateIncludeAttrs: string[];
  vueTemplateExcludeAttrs: string[];
  ignoreTexts: string[];
  ignoreCallExpressionCallees: string[];
  translationFailureStrategy: "skip" | "fill-with-source" | "abort";
}

export interface BootstrapSetupStore {
  get: (key: string) => boolean | undefined;
  set: (key: string, value: boolean) => Promise<void> | Thenable<void> | void;
}

export type BootstrapSetupLauncher = (params: {
  defaults: ExtractBootstrapConfig;
  hasDetectedLangs: boolean;
  projectPath: string;
  isFirstSetup: boolean;
  uiLanguage: string;
}) => Promise<BootstrapRaw | null>;

function getDefaultTargetLanguages(uiLanguage: string) {
  const uiLangCode = getLangCode(uiLanguage) ?? "";
  const values = ["en", uiLangCode].filter((item): item is string => item.trim().length > 0);
  return Array.from(new Set(values));
}

function defaultBootstrapConfig(uiLanguage: string): ExtractBootstrapConfig {
  return {
    framework: "none",
    languagePath: "src/i18n",
    fileExtensions: [".js", ".ts", ".jsx", ".tsx", ".vue"],
    vueTemplateFunctionName: "t",
    vueScriptFunctionName: "t",
    jsTsFunctionName: "t",
    vueScriptImportLines: [],
    vueScriptSetupLines: [],
    jsTsImportLines: [],
    jsTsSetupLines: [],
    skipJsTsInjection: false,
    skipVueScriptInjection: false,
    keyPrefix: "auto-path",
    prefixCandidates: [],
    languageStructure: "flat",
    sortRule: "byKey",
    keyStrategy: "english",
    keyStyle: "camelCase",
    maxKeyLength: 40,
    invalidKeyStrategy: "fallback",
    indentType: "space",
    indentSize: 2,
    quoteStyleForKey: "double",
    quoteStyleForValue: "double",
    stopWords: [],
    stopPrefixes: [],
    onlyExtractSourceLanguageText: true,
    referenceLanguage: uiLanguage || "en",
    translationFileType: "json",
    extractScopePaths: [],
    ignoreExtractScopePaths: [],
    targetLanguages: getDefaultTargetLanguages(uiLanguage),
    vueTemplateIncludeAttrs: [],
    vueTemplateExcludeAttrs: ["key", "ref", "prop", "value", "class", "style", "id", "for", "type", "name", "src", "href", "to"],
    ignoreTexts: [],
    ignoreCallExpressionCallees: ["console"],
    translationFailureStrategy: "skip"
  };
}

function parseCsvText(input: string | undefined) {
  if (typeof input !== "string") return [];
  return input
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function parseScopePathsFromText(input: string | undefined) {
  if (typeof input !== "string") return [];
  return input
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function parseLinesText(input: string | undefined) {
  if (typeof input !== "string") return [];
  return input
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function isShallowEqual(a: unknown, b: unknown) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => item === b[index]);
  }
  return a === b;
}

export function getApplyValidationError(params: {
  hasDetectedLangs: boolean;
  fileExtensions: string[];
  framework: string;
  languagePath: string;
  targetLanguages: string[];
  jsTsFunctionName: string;
  jsTsImportLines: string[];
  vueScriptImportLines: string[];
  skipJsTsInjection: boolean;
  skipVueScriptInjection: boolean;
  keyPrefix: ExtractBootstrapConfig["keyPrefix"];
  prefixCandidates: string[];
}) {
  const normalizedExts = params.fileExtensions.map(item => item.trim().toLowerCase());
  const hasJsTsFiles = normalizedExts.some(item => [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"].includes(item));
  const hasVueFiles = normalizedExts.includes(".vue");
  if (!params.hasDetectedLangs && params.languagePath.trim().length === 0) {
    return t("extractSetup.errorLanguagePathRequired");
  }
  if (!params.hasDetectedLangs && params.targetLanguages.length === 0) {
    return t("extractSetup.errorTargetLanguagesRequired");
  }
  if (hasJsTsFiles && params.jsTsFunctionName.trim().length === 0) {
    return `${t("extractSetup.labelJsTsFunctionName")} ${t("common.validate.required")}`;
  }
  if (hasJsTsFiles && !params.skipJsTsInjection && params.jsTsImportLines.length === 0) {
    return `${t("extractSetup.labelJsTsImportLines")} ${t("common.validate.required")}`;
  }
  if (hasVueFiles && params.framework === "vue-i18n" && !params.skipVueScriptInjection && params.vueScriptImportLines.length === 0) {
    return `${t("extractSetup.labelVueScriptImportLines")} ${t("common.validate.required")}`;
  }
  if (params.keyPrefix === "ai-selection" && params.prefixCandidates.length === 0) {
    return t("extractSetup.errorPrefixCandidatesRequired");
  }
  return "";
}

export function sanitizeBootstrapConfig(raw: BootstrapRaw | undefined, uiLanguage: string): ExtractBootstrapConfig {
  const defaults = defaultBootstrapConfig(uiLanguage);
  if (!raw) return defaults;

  const fileExtensions = Array.isArray(raw.fileExtensions)
    ? raw.fileExtensions
    : parseCsvText(raw.fileExtensionsText).map(ext => (ext.startsWith(".") ? ext : `.${ext}`));

  const stopWords = Array.isArray(raw.stopWords) ? raw.stopWords : parseCsvText(raw.stopWordsText);
  const stopPrefixes = Array.isArray(raw.stopPrefixes) ? raw.stopPrefixes : parseCsvText(raw.stopPrefixesText);
  const prefixCandidates = Array.isArray(raw.prefixCandidates) ? raw.prefixCandidates : parseCsvText(raw.prefixCandidatesText);
  const targetLanguages = Array.isArray(raw.targetLanguages) ? raw.targetLanguages : parseCsvText(raw.targetLanguagesText);
  const ignoreExtractScopePaths = Array.isArray(raw.ignoreExtractScopePaths)
    ? raw.ignoreExtractScopePaths
    : parseCsvText(raw.ignoreExtractScopePathsText);
  const extractScopePaths = Array.isArray(raw.extractScopePaths)
    ? raw.extractScopePaths
    : parseScopePathsFromText(raw.extractScopePathsText);
  const vueTemplateIncludeAttrs = Array.isArray(raw.vueTemplateIncludeAttrs)
    ? raw.vueTemplateIncludeAttrs
    : parseCsvText(raw.vueTemplateIncludeAttrsText);
  const vueTemplateExcludeAttrs = Array.isArray(raw.vueTemplateExcludeAttrs)
    ? raw.vueTemplateExcludeAttrs
    : parseCsvText(raw.vueTemplateExcludeAttrsText);
  const ignoreTexts = Array.isArray(raw.ignoreTexts) ? raw.ignoreTexts : parseCsvText(raw.ignoreTextsText);
  const hasExplicitIgnoreCallExpressionCalleesInput =
    Array.isArray(raw.ignoreCallExpressionCallees) || typeof raw.ignoreCallExpressionCalleesText === "string";
  const ignoreCallExpressionCallees = Array.isArray(raw.ignoreCallExpressionCallees)
    ? raw.ignoreCallExpressionCallees
    : parseCsvText(raw.ignoreCallExpressionCalleesText);
  const vueScriptImportLines = Array.isArray(raw.vueScriptImportLines)
    ? raw.vueScriptImportLines
    : parseLinesText(raw.vueScriptImportLinesText);
  const vueScriptSetupLines = Array.isArray(raw.vueScriptSetupLines)
    ? raw.vueScriptSetupLines
    : parseLinesText(raw.vueScriptSetupLinesText);
  const jsTsImportLines = Array.isArray(raw.jsTsImportLines) ? raw.jsTsImportLines : parseLinesText(raw.jsTsImportLinesText);
  const jsTsSetupLines = Array.isArray(raw.jsTsSetupLines) ? raw.jsTsSetupLines : parseLinesText(raw.jsTsSetupLinesText);

  const config: ExtractBootstrapConfig = {
    syncToWorkspaceConfig: typeof raw.syncToWorkspaceConfig === "boolean" ? raw.syncToWorkspaceConfig : false,
    framework: typeof raw.framework === "string" && raw.framework.trim() ? raw.framework.trim() : defaults.framework,
    languagePath: typeof raw.languagePath === "string" && raw.languagePath.trim() ? raw.languagePath.trim() : defaults.languagePath,
    fileExtensions: fileExtensions.length > 0 ? fileExtensions : defaults.fileExtensions,
    vueTemplateFunctionName:
      typeof raw.vueTemplateFunctionName === "string" && raw.vueTemplateFunctionName.trim()
        ? raw.vueTemplateFunctionName.trim()
        : defaults.vueTemplateFunctionName,
    vueScriptFunctionName:
      typeof raw.vueScriptFunctionName === "string" && raw.vueScriptFunctionName.trim()
        ? raw.vueScriptFunctionName.trim()
        : defaults.vueScriptFunctionName,
    jsTsFunctionName:
      typeof raw.jsTsFunctionName === "string" && raw.jsTsFunctionName.trim() ? raw.jsTsFunctionName.trim() : defaults.jsTsFunctionName,
    vueScriptImportLines: vueScriptImportLines.length > 0 ? vueScriptImportLines : defaults.vueScriptImportLines,
    vueScriptSetupLines: vueScriptSetupLines.length > 0 ? vueScriptSetupLines : defaults.vueScriptSetupLines,
    jsTsImportLines: jsTsImportLines.length > 0 ? jsTsImportLines : defaults.jsTsImportLines,
    jsTsSetupLines: jsTsSetupLines.length > 0 ? jsTsSetupLines : defaults.jsTsSetupLines,
    skipJsTsInjection: typeof raw.skipJsTsInjection === "boolean" ? raw.skipJsTsInjection : defaults.skipJsTsInjection,
    skipVueScriptInjection: typeof raw.skipVueScriptInjection === "boolean" ? raw.skipVueScriptInjection : defaults.skipVueScriptInjection,
    keyPrefix:
      raw.keyPrefix === "none" || raw.keyPrefix === "auto-path" || raw.keyPrefix === "ai-selection" ? raw.keyPrefix : defaults.keyPrefix,
    prefixCandidates: prefixCandidates.map(item => item.trim()).filter(Boolean),
    languageStructure:
      raw.languageStructure === "nested" || raw.languageStructure === "flat" ? raw.languageStructure : defaults.languageStructure,
    sortRule: raw.sortRule === "none" || raw.sortRule === "byKey" || raw.sortRule === "byPosition" ? raw.sortRule : defaults.sortRule,
    keyStrategy: raw.keyStrategy === "english" || raw.keyStrategy === "pinyin" ? raw.keyStrategy : defaults.keyStrategy,
    keyStyle:
      raw.keyStyle === "camelCase" ||
      raw.keyStyle === "PascalCase" ||
      raw.keyStyle === "snake_case" ||
      raw.keyStyle === "kebab-case" ||
      raw.keyStyle === "raw"
        ? raw.keyStyle
        : defaults.keyStyle,
    maxKeyLength:
      typeof raw.maxKeyLength === "number" && Number.isFinite(raw.maxKeyLength)
        ? Math.max(10, Math.min(100, Math.floor(raw.maxKeyLength)))
        : defaults.maxKeyLength,
    invalidKeyStrategy:
      raw.invalidKeyStrategy === "fallback" || raw.invalidKeyStrategy === "ai" ? raw.invalidKeyStrategy : defaults.invalidKeyStrategy,
    indentType: raw.indentType === "auto" || raw.indentType === "space" || raw.indentType === "tab" ? raw.indentType : defaults.indentType,
    indentSize:
      raw.indentSize === null
        ? null
        : typeof raw.indentSize === "number" && Number.isFinite(raw.indentSize)
          ? Math.max(0, Math.min(8, Math.floor(raw.indentSize)))
          : defaults.indentSize,
    quoteStyleForKey:
      raw.quoteStyleForKey === "none" ||
      raw.quoteStyleForKey === "single" ||
      raw.quoteStyleForKey === "double" ||
      raw.quoteStyleForKey === "auto"
        ? raw.quoteStyleForKey
        : defaults.quoteStyleForKey,
    quoteStyleForValue:
      raw.quoteStyleForValue === "single" || raw.quoteStyleForValue === "double" || raw.quoteStyleForValue === "auto"
        ? raw.quoteStyleForValue
        : defaults.quoteStyleForValue,
    stopWords,
    stopPrefixes,
    onlyExtractSourceLanguageText:
      typeof raw.onlyExtractSourceLanguageText === "boolean" ? raw.onlyExtractSourceLanguageText : defaults.onlyExtractSourceLanguageText,
    referenceLanguage:
      typeof raw.referenceLanguage === "string" && raw.referenceLanguage.trim() ? raw.referenceLanguage.trim() : defaults.referenceLanguage,
    translationFileType:
      raw.translationFileType === "json" ||
      raw.translationFileType === "json5" ||
      raw.translationFileType === "js" ||
      raw.translationFileType === "ts" ||
      raw.translationFileType === "yaml" ||
      raw.translationFileType === "yml"
        ? raw.translationFileType
        : defaults.translationFileType,
    extractScopePaths,
    ignoreExtractScopePaths: ignoreExtractScopePaths.map(item => item.trim()).filter(Boolean),
    targetLanguages: targetLanguages.length > 0 ? targetLanguages : defaults.targetLanguages,
    vueTemplateIncludeAttrs: vueTemplateIncludeAttrs.map(item => item.toLowerCase()),
    vueTemplateExcludeAttrs:
      vueTemplateExcludeAttrs.length > 0 ? vueTemplateExcludeAttrs.map(item => item.toLowerCase()) : defaults.vueTemplateExcludeAttrs,
    ignoreTexts: ignoreTexts.map(item => item.trim()).filter(Boolean),
    ignoreCallExpressionCallees: hasExplicitIgnoreCallExpressionCalleesInput
      ? ignoreCallExpressionCallees.map(item => item.trim()).filter(Boolean)
      : defaults.ignoreCallExpressionCallees,
    translationFailureStrategy:
      raw.translationFailureStrategy === "skip" ||
      raw.translationFailureStrategy === "fill-with-source" ||
      raw.translationFailureStrategy === "abort"
        ? raw.translationFailureStrategy
        : defaults.translationFailureStrategy
  };

  if (config.languageStructure === "nested" && config.sortRule === "byPosition") {
    config.sortRule = "byKey";
  }
  if (config.translationFileType === "yaml" || config.translationFileType === "yml") {
    config.quoteStyleForKey = "auto";
    config.quoteStyleForValue = "auto";
  }
  return config;
}

export async function ensureBootstrapConfig(params: {
  projectPath: string;
  hasDetectedLangs: boolean;
  initialExtractScopePath?: string;
  overrideDefaults?: ExtractBootstrapConfig;
  uiLanguage: string;
  setupStore: BootstrapSetupStore;
  launchSetup: BootstrapSetupLauncher;
}): Promise<ExtractBootstrapConfig | null> {
  const seenKey = getSetupSeenKey(params.projectPath);
  const isFirstSetup = params.setupStore.get(seenKey) !== true;
  if (isFirstSetup) {
    await params.setupStore.set(seenKey, true);
  }
  const scopedDefaults = (defaults: ExtractBootstrapConfig) =>
    sanitizeBootstrapConfig(
      {
        ...defaults,
        extractScopePaths:
          typeof params.initialExtractScopePath === "string" && params.initialExtractScopePath.trim().length > 0
            ? [params.initialExtractScopePath.trim()]
            : defaults.extractScopePaths
      },
      params.uiLanguage
    );

  if (params.hasDetectedLangs) {
    const defaults = scopedDefaults(params.overrideDefaults ?? getDetectedProjectDefaults(params.projectPath, params.uiLanguage));
    const raw = await params.launchSetup({
      defaults,
      hasDetectedLangs: true,
      projectPath: params.projectPath,
      isFirstSetup,
      uiLanguage: params.uiLanguage
    });
    if (raw === null) return null;
    const config = sanitizeBootstrapConfig(raw, params.uiLanguage);
    if (config.syncToWorkspaceConfig === true) {
      await applyDetectedConfigs(config);
    }
    return config;
  }

  const defaults = scopedDefaults(params.overrideDefaults ?? getUndetectedProjectDefaults(params.projectPath, params.uiLanguage));
  const raw = await params.launchSetup({
    defaults,
    hasDetectedLangs: false,
    projectPath: params.projectPath,
    isFirstSetup,
    uiLanguage: params.uiLanguage
  });
  if (raw === null) return null;
  const config = sanitizeBootstrapConfig(raw, params.uiLanguage);

  if (config.syncToWorkspaceConfig === true) {
    await applyKnownConfigs(config, params.projectPath);
  }
  await ensureTranslationFiles(config, params.projectPath);
  return config;
}

function getDetectedProjectDefaults(projectPath: string, uiLanguage: string): ExtractBootstrapConfig {
  return inferBootstrapConfigFromCurrent(projectPath, uiLanguage);
}

function getUndetectedProjectDefaults(projectPath: string, uiLanguage: string): ExtractBootstrapConfig {
  return inferBootstrapConfigFromCurrent(projectPath, uiLanguage);
}

function getSetupSeenKey(projectPath: string) {
  const normalized = process.platform === "win32" ? path.normalize(projectPath).toLowerCase() : path.normalize(projectPath);
  return `extract.setupSeen.${normalized}`;
}

async function setConfigIfChanged<T>(key: string, value: T, targetScope: "global" | "workspace" | "workspaceFolder" = "workspace") {
  const current = getConfig<T>(key);
  if (isShallowEqual(current, value)) return;
  await setConfig(key, value, targetScope);
}

function inferBootstrapConfigFromCurrent(projectPath: string, uiLanguage: string): ExtractBootstrapConfig {
  const defaults = defaultBootstrapConfig(uiLanguage);
  const languagePath = getConfig<string>("workspace.languagePath", defaults.languagePath);
  const languagePathAbs = path.isAbsolute(languagePath) ? languagePath : path.join(projectPath, languagePath);

  return sanitizeBootstrapConfig(
    {
      ...defaults,
      framework: getConfig<string>("i18nFeatures.framework", defaults.framework),
      languagePath: toRelativePath(languagePathAbs),
      fileExtensions: getConfig<string[]>("extract.fileExtensions", defaults.fileExtensions),
      vueTemplateFunctionName: getConfig<string>("extract.vueTemplateFunctionName", defaults.vueTemplateFunctionName),
      vueScriptFunctionName: getConfig<string>("extract.vueScriptFunctionName", defaults.vueScriptFunctionName),
      jsTsFunctionName: getConfig<string>("extract.jsTsFunctionName", defaults.jsTsFunctionName),
      vueScriptImportLines: getConfig<string[]>("extract.vueScriptImportLines", defaults.vueScriptImportLines),
      vueScriptSetupLines: getConfig<string[]>("extract.vueScriptSetupLines", defaults.vueScriptSetupLines),
      jsTsImportLines: getConfig<string[]>("extract.jsTsImportLines", defaults.jsTsImportLines),
      jsTsSetupLines: getConfig<string[]>("extract.jsTsSetupLines", defaults.jsTsSetupLines),
      skipJsTsInjection: getConfig<boolean>("extract.skipJsTsInjection", defaults.skipJsTsInjection),
      skipVueScriptInjection: getConfig<boolean>("extract.skipVueScriptInjection", defaults.skipVueScriptInjection),
      onlyExtractSourceLanguageText: getConfig<boolean>("extract.onlyExtractSourceLanguageText", defaults.onlyExtractSourceLanguageText),
      vueTemplateIncludeAttrs: getConfig<string[]>("extract.vueTemplateIncludeAttrs", defaults.vueTemplateIncludeAttrs),
      vueTemplateExcludeAttrs: getConfig<string[]>("extract.vueTemplateExcludeAttrs", defaults.vueTemplateExcludeAttrs),
      ignoreTexts: getConfig<string[]>("extract.ignoreTexts", defaults.ignoreTexts),
      ignoreCallExpressionCallees: getConfig<string[]>("extract.ignoreCallExpressionCallees", defaults.ignoreCallExpressionCallees),
      translationFailureStrategy: getConfig<"skip" | "fill-with-source" | "abort">(
        "extract.translationFailureStrategy",
        defaults.translationFailureStrategy
      ),
      extractScopePaths: getConfig<string[]>("workspace.extractScopeWhitelist", defaults.extractScopePaths),
      ignoreExtractScopePaths: getConfig<string[]>("workspace.extractScopeBlacklist", defaults.ignoreExtractScopePaths),
      keyPrefix: getConfig<"none" | "auto-path" | "ai-selection">("writeRules.keyPrefix", defaults.keyPrefix),
      prefixCandidates: getConfig<string[]>("writeRules.prefixCandidates", defaults.prefixCandidates),
      languageStructure: getConfig<"flat" | "nested">("writeRules.languageStructure", defaults.languageStructure),
      sortRule: getConfig<"none" | "byKey" | "byPosition">("writeRules.sortRule", defaults.sortRule),
      keyStrategy: getConfig<"english" | "pinyin">("writeRules.keyStrategy", defaults.keyStrategy),
      keyStyle: getConfig<"camelCase" | "PascalCase" | "snake_case" | "kebab-case" | "raw">("writeRules.keyStyle", defaults.keyStyle),
      maxKeyLength: getConfig<number>("writeRules.maxKeyLength", defaults.maxKeyLength),
      invalidKeyStrategy: getConfig<"fallback" | "ai">("writeRules.invalidKeyStrategy", defaults.invalidKeyStrategy),
      indentType: getConfig<"auto" | "space" | "tab">("writeRules.indentType", defaults.indentType),
      indentSize: getConfig<number | null>("writeRules.indentSize", defaults.indentSize),
      quoteStyleForKey: getConfig<"none" | "single" | "double" | "auto">("writeRules.quoteStyleForKey", defaults.quoteStyleForKey),
      quoteStyleForValue: getConfig<"single" | "double" | "auto">("writeRules.quoteStyleForValue", defaults.quoteStyleForValue),
      stopWords: getConfig<string[]>("writeRules.stopWords", defaults.stopWords),
      stopPrefixes: getConfig<string[]>("writeRules.stopPrefixes", defaults.stopPrefixes),
      referenceLanguage: getConfig<string>("translationServices.referenceLanguage", defaults.referenceLanguage),
      targetLanguages: defaults.targetLanguages
    },
    uiLanguage
  );
}

async function applyKnownConfigs(config: ExtractBootstrapConfig, projectPath: string) {
  const langPath = path.isAbsolute(config.languagePath) ? config.languagePath : path.join(projectPath, config.languagePath);

  await setConfigIfChanged("i18nFeatures.framework", config.framework as never);
  await setConfigIfChanged("workspace.languagePath", toRelativePath(langPath));
  await setConfigIfChanged("extract.fileExtensions", config.fileExtensions);
  await setConfigIfChanged("extract.jsTsFunctionName", config.jsTsFunctionName);
  await setConfigIfChanged("extract.jsTsImportLines", config.jsTsImportLines);
  await setConfigIfChanged("extract.jsTsSetupLines", config.jsTsSetupLines);
  await setConfigIfChanged("extract.skipJsTsInjection", config.skipJsTsInjection);
  await setConfigIfChanged("extract.skipVueScriptInjection", config.skipVueScriptInjection);
  await setConfigIfChanged("extract.vueTemplateFunctionName", config.vueTemplateFunctionName);
  await setConfigIfChanged("extract.vueScriptFunctionName", config.vueScriptFunctionName);
  await setConfigIfChanged("extract.vueScriptImportLines", config.vueScriptImportLines);
  await setConfigIfChanged("extract.vueScriptSetupLines", config.vueScriptSetupLines);
  await setConfigIfChanged("extract.onlyExtractSourceLanguageText", config.onlyExtractSourceLanguageText);
  await setConfigIfChanged("extract.vueTemplateIncludeAttrs", config.vueTemplateIncludeAttrs);
  await setConfigIfChanged("extract.vueTemplateExcludeAttrs", config.vueTemplateExcludeAttrs);
  await setConfigIfChanged("extract.ignoreTexts", config.ignoreTexts);
  await setConfigIfChanged("extract.ignoreCallExpressionCallees", config.ignoreCallExpressionCallees);
  await setConfigIfChanged("extract.translationFailureStrategy", config.translationFailureStrategy);
  await setConfigIfChanged("workspace.extractScopeWhitelist", config.extractScopePaths);
  await setConfigIfChanged("workspace.extractScopeBlacklist", config.ignoreExtractScopePaths);
  const functionNames = Array.from(new Set([config.jsTsFunctionName, config.vueTemplateFunctionName, config.vueScriptFunctionName])).filter(
    item => item.trim().length > 0
  );
  await setConfigIfChanged("i18nFeatures.translationFunctionNames", functionNames);
  await setConfigIfChanged("writeRules.keyPrefix", config.keyPrefix);
  await setConfigIfChanged("writeRules.prefixCandidates", config.prefixCandidates);
  await setConfigIfChanged("writeRules.languageStructure", config.languageStructure);
  await setConfigIfChanged("writeRules.sortRule", config.sortRule);
  await setConfigIfChanged("writeRules.keyStrategy", config.keyStrategy);
  await setConfigIfChanged("writeRules.keyStyle", config.keyStyle);
  await setConfigIfChanged("writeRules.maxKeyLength", config.maxKeyLength);
  await setConfigIfChanged("writeRules.invalidKeyStrategy", config.invalidKeyStrategy);
  await setConfigIfChanged("writeRules.indentType", config.indentType);
  await setConfigIfChanged("writeRules.indentSize", config.indentSize);
  await setConfigIfChanged("writeRules.quoteStyleForKey", config.quoteStyleForKey);
  await setConfigIfChanged("writeRules.quoteStyleForValue", config.quoteStyleForValue);
  await setConfigIfChanged("writeRules.stopWords", config.stopWords);
  await setConfigIfChanged("writeRules.stopPrefixes", config.stopPrefixes);
  await setConfigIfChanged("translationServices.referenceLanguage", config.referenceLanguage, "global");
  clearConfigCache("workspace.languagePath");
  clearConfigCache("extract");
  clearConfigCache("workspace.extractScopeWhitelist");
  clearConfigCache("workspace.extractScopeBlacklist");
  clearConfigCache("i18nFeatures.translationFunctionNames");
  clearConfigCache("i18nFeatures.framework");
  clearConfigCache("writeRules");
  clearConfigCache("translationServices.referenceLanguage");
}

async function applyDetectedConfigs(config: ExtractBootstrapConfig) {
  await setConfigIfChanged("extract.fileExtensions", config.fileExtensions);
  await setConfigIfChanged("extract.jsTsFunctionName", config.jsTsFunctionName);
  await setConfigIfChanged("extract.jsTsImportLines", config.jsTsImportLines);
  await setConfigIfChanged("extract.jsTsSetupLines", config.jsTsSetupLines);
  await setConfigIfChanged("extract.skipJsTsInjection", config.skipJsTsInjection);
  await setConfigIfChanged("extract.skipVueScriptInjection", config.skipVueScriptInjection);
  await setConfigIfChanged("extract.vueTemplateFunctionName", config.vueTemplateFunctionName);
  await setConfigIfChanged("extract.vueScriptFunctionName", config.vueScriptFunctionName);
  await setConfigIfChanged("extract.vueScriptImportLines", config.vueScriptImportLines);
  await setConfigIfChanged("extract.vueScriptSetupLines", config.vueScriptSetupLines);
  await setConfigIfChanged("extract.onlyExtractSourceLanguageText", config.onlyExtractSourceLanguageText);
  await setConfigIfChanged("extract.vueTemplateIncludeAttrs", config.vueTemplateIncludeAttrs);
  await setConfigIfChanged("extract.vueTemplateExcludeAttrs", config.vueTemplateExcludeAttrs);
  await setConfigIfChanged("extract.ignoreTexts", config.ignoreTexts);
  await setConfigIfChanged("extract.ignoreCallExpressionCallees", config.ignoreCallExpressionCallees);
  await setConfigIfChanged("extract.translationFailureStrategy", config.translationFailureStrategy);
  await setConfigIfChanged("workspace.extractScopeWhitelist", config.extractScopePaths);
  await setConfigIfChanged("workspace.extractScopeBlacklist", config.ignoreExtractScopePaths);
  const functionNames = Array.from(new Set([config.jsTsFunctionName, config.vueTemplateFunctionName, config.vueScriptFunctionName])).filter(
    item => item.trim().length > 0
  );
  await setConfigIfChanged("i18nFeatures.translationFunctionNames", functionNames);
  clearConfigCache("extract");
  clearConfigCache("workspace.extractScopeWhitelist");
  clearConfigCache("workspace.extractScopeBlacklist");
  clearConfigCache("i18nFeatures.translationFunctionNames");
}

async function ensureTranslationFiles(config: ExtractBootstrapConfig, projectPath: string) {
  const langDir = path.isAbsolute(config.languagePath) ? config.languagePath : path.join(projectPath, config.languagePath);
  await fs.promises.mkdir(langDir, { recursive: true });

  const langs = config.targetLanguages.length > 0 ? config.targetLanguages : [config.referenceLanguage || "en"];
  for (const lang of langs) {
    const filePath = path.join(langDir, `${lang}.${config.translationFileType}`);
    if (fs.existsSync(filePath)) continue;
    await fs.promises.writeFile(filePath, "{}\n", "utf8");
  }
}
