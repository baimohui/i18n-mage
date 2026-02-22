import * as vscode from "vscode";
import fs from "fs";
import path from "path";
import { clearConfigCache, getConfig, setConfig } from "@/utils/config";
import { toRelativePath } from "@/utils/fs";
import { t } from "@/utils/i18n";
import { getLangCode, LANG_CODE_MAPPINGS } from "@/utils/langKey";
import { NotificationManager } from "@/utils/notification";

type BootstrapRaw = Partial<ExtractBootstrapConfig> & {
  fileExtensionsText?: string;
  stopWordsText?: string;
  stopPrefixesText?: string;
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
  keyPrefix: "none" | "auto-path";
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
  ignorePossibleVariables: boolean;
  onlyExtractSourceLanguageText: boolean;
  referenceLanguage: string;
  translationFileType: "json" | "json5" | "js" | "ts" | "yaml" | "yml";
  extractScopePaths: string[];
  ignoreExtractScopePaths: string[];
  targetLanguages: string[];
  vueTemplateIncludeAttrs: string[];
  vueTemplateExcludeAttrs: string[];
  ignoreTexts: string[];
}

function getDefaultTargetLanguages() {
  const uiLangCode = getLangCode(vscode.env.language) ?? "";
  const values = ["en", uiLangCode].filter((item): item is string => item.trim().length > 0);
  return Array.from(new Set(values));
}

function defaultBootstrapConfig(): ExtractBootstrapConfig {
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
    ignorePossibleVariables: true,
    onlyExtractSourceLanguageText: true,
    referenceLanguage: vscode.env.language || "en",
    translationFileType: "json",
    extractScopePaths: [],
    ignoreExtractScopePaths: [],
    targetLanguages: getDefaultTargetLanguages(),
    vueTemplateIncludeAttrs: [],
    vueTemplateExcludeAttrs: ["key", "ref", "prop", "value", "class", "style", "id", "for", "type", "name", "src", "href", "to"],
    ignoreTexts: []
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

function getApplyValidationError(params: {
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
  return "";
}

function sanitizeBootstrapConfig(raw: BootstrapRaw | undefined): ExtractBootstrapConfig {
  const defaults = defaultBootstrapConfig();
  if (!raw) return defaults;

  const fileExtensions = Array.isArray(raw.fileExtensions)
    ? raw.fileExtensions
    : parseCsvText(raw.fileExtensionsText).map(ext => (ext.startsWith(".") ? ext : `.${ext}`));

  const stopWords = Array.isArray(raw.stopWords) ? raw.stopWords : parseCsvText(raw.stopWordsText);
  const stopPrefixes = Array.isArray(raw.stopPrefixes) ? raw.stopPrefixes : parseCsvText(raw.stopPrefixesText);
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
    keyPrefix: raw.keyPrefix === "none" || raw.keyPrefix === "auto-path" ? raw.keyPrefix : defaults.keyPrefix,
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
    ignorePossibleVariables:
      typeof raw.ignorePossibleVariables === "boolean" ? raw.ignorePossibleVariables : defaults.ignorePossibleVariables,
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
    ignoreTexts: ignoreTexts.map(item => item.trim()).filter(Boolean)
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
  context: vscode.ExtensionContext;
  projectPath: string;
  hasDetectedLangs: boolean;
  initialExtractScopePath?: string;
}): Promise<ExtractBootstrapConfig | null> {
  const seenKey = getSetupSeenKey(params.projectPath);
  const isFirstSetup = params.context.workspaceState.get<boolean>(seenKey) !== true;
  if (isFirstSetup) {
    await params.context.workspaceState.update(seenKey, true);
  }
  const scopedDefaults = (defaults: ExtractBootstrapConfig) =>
    sanitizeBootstrapConfig({
      ...defaults,
      extractScopePaths:
        typeof params.initialExtractScopePath === "string" && params.initialExtractScopePath.trim().length > 0
          ? [params.initialExtractScopePath.trim()]
          : defaults.extractScopePaths
    });

  if (params.hasDetectedLangs) {
    const defaults = scopedDefaults(getDetectedProjectDefaults(params.projectPath));
    const raw = await openBootstrapWebview(params.context, defaults, true, params.projectPath, isFirstSetup);
    if (raw === null) return null;
    const config = sanitizeBootstrapConfig(raw);
    if (config.syncToWorkspaceConfig === true) {
      await applyDetectedConfigs(config);
    }
    return config;
  }

  const defaults = scopedDefaults(getUndetectedProjectDefaults(params.projectPath));
  const raw = await openBootstrapWebview(params.context, defaults, false, params.projectPath, isFirstSetup);
  if (raw === null) return null;
  const config = sanitizeBootstrapConfig(raw);

  if (config.syncToWorkspaceConfig === true) {
    await applyKnownConfigs(config, params.projectPath);
  }
  await ensureTranslationFiles(config, params.projectPath);
  return config;
}

function getDetectedProjectDefaults(projectPath: string): ExtractBootstrapConfig {
  return inferBootstrapConfigFromCurrent(projectPath);
}

function getUndetectedProjectDefaults(projectPath: string): ExtractBootstrapConfig {
  return inferBootstrapConfigFromCurrent(projectPath);
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

function inferBootstrapConfigFromCurrent(projectPath: string): ExtractBootstrapConfig {
  const defaults = defaultBootstrapConfig();
  const languagePath = getConfig<string>("workspace.languagePath", defaults.languagePath);
  const languagePathAbs = path.isAbsolute(languagePath) ? languagePath : path.join(projectPath, languagePath);

  return sanitizeBootstrapConfig({
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
    extractScopePaths: getConfig<string[]>("workspace.extractScopeWhitelist", defaults.extractScopePaths),
    ignoreExtractScopePaths: getConfig<string[]>("workspace.extractScopeBlacklist", defaults.ignoreExtractScopePaths),
    keyPrefix: getConfig<"none" | "auto-path">("writeRules.keyPrefix", defaults.keyPrefix),
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
    ignorePossibleVariables: getConfig<boolean>("translationServices.ignorePossibleVariables", defaults.ignorePossibleVariables),
    referenceLanguage: getConfig<string>("translationServices.referenceLanguage", defaults.referenceLanguage),
    targetLanguages: defaults.targetLanguages
  });
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
  await setConfigIfChanged("workspace.extractScopeWhitelist", config.extractScopePaths);
  await setConfigIfChanged("workspace.extractScopeBlacklist", config.ignoreExtractScopePaths);
  const functionNames = Array.from(new Set([config.jsTsFunctionName, config.vueTemplateFunctionName, config.vueScriptFunctionName])).filter(
    item => item.trim().length > 0
  );
  await setConfigIfChanged("i18nFeatures.translationFunctionNames", functionNames);
  await setConfigIfChanged("writeRules.keyPrefix", config.keyPrefix);
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
  await setConfigIfChanged("translationServices.ignorePossibleVariables", config.ignorePossibleVariables);
  await setConfigIfChanged("translationServices.referenceLanguage", config.referenceLanguage, "global");
  clearConfigCache("workspace.languagePath");
  clearConfigCache("extract");
  clearConfigCache("workspace.extractScopeWhitelist");
  clearConfigCache("workspace.extractScopeBlacklist");
  clearConfigCache("i18nFeatures.translationFunctionNames");
  clearConfigCache("i18nFeatures.framework");
  clearConfigCache("writeRules");
  clearConfigCache("translationServices.referenceLanguage");
  clearConfigCache("translationServices.ignorePossibleVariables");
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

function openBootstrapWebview(
  context: vscode.ExtensionContext,
  defaults: ExtractBootstrapConfig,
  hasDetectedLangs: boolean,
  projectPath: string,
  isFirstSetup: boolean
): Promise<BootstrapRaw | null> {
  return new Promise(resolve => {
    const panel = vscode.window.createWebviewPanel("i18nMage.extractSetup", "i18n Mage Setup", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "dist", "webviews"))]
    });
    panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, "images", "icon.png"));

    const nonce = Math.random().toString(36).slice(2);
    const scriptPath = vscode.Uri.file(path.join(context.extensionPath, "dist", "webviews", "extract-setup.js"));
    const scriptSrc = panel.webview.asWebviewUri(scriptPath).toString();

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${panel.webview.cspSource}; script-src 'nonce-${nonce}' ${panel.webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Extract Setup</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.webviewData = ${JSON.stringify({
      language: vscode.env.language,
      hasDetectedLangs,
      isFirstSetup,
      defaults,
      availableLanguages: Array.from(
        new Map(
          Object.entries(LANG_CODE_MAPPINGS).map(([key, info]) => {
            const code = info.ggCode || key;
            return [code, { code, label: `${info.cnName} (${code})` }];
          })
        ).values()
      )
    }).replace(/</g, "\\u003c")};
    window.addEventListener('load', () => {
      setTimeout(() => {
        const root = document.getElementById('root');
        if (root) {
          root.setAttribute('tabindex', '-1');
          root.focus();
        }
        document.body.setAttribute('tabindex', '-1');
        document.body.focus();
        window.focus();
      }, 100);
    });
  </script>
  <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
</body>
</html>`;

    let settled = false;
    const dispose = panel.webview.onDidReceiveMessage((msg: { type: string; value?: unknown }) => {
      if (msg.type === "save") {
        const raw = (msg.value ?? null) as BootstrapRaw | null;
        if (raw === null) {
          NotificationManager.showError("Invalid form value");
          return;
        }
        const parsed = sanitizeBootstrapConfig(raw);
        const validationError = getApplyValidationError({
          hasDetectedLangs,
          fileExtensions: parsed.fileExtensions,
          framework: parsed.framework,
          languagePath: parsed.languagePath,
          targetLanguages: parsed.targetLanguages,
          jsTsFunctionName: parsed.jsTsFunctionName,
          jsTsImportLines: parsed.jsTsImportLines,
          vueScriptImportLines: parsed.vueScriptImportLines,
          skipJsTsInjection: parsed.skipJsTsInjection,
          skipVueScriptInjection: parsed.skipVueScriptInjection
        });
        if (validationError.length > 0) {
          NotificationManager.showError(validationError);
          return;
        }
        if (parsed.extractScopePaths.length > 0) {
          for (const scopePath of parsed.extractScopePaths) {
            const absoluteScopePath = path.isAbsolute(scopePath) ? scopePath : path.join(projectPath, scopePath);
            if (!fs.existsSync(absoluteScopePath)) {
              NotificationManager.showError(t("extractSetup.errorExtractScopePathInvalid", scopePath));
              return;
            }
          }
        }
        if (parsed.ignoreExtractScopePaths.length > 0) {
          for (const ignorePath of parsed.ignoreExtractScopePaths) {
            const absoluteIgnorePath = path.isAbsolute(ignorePath) ? ignorePath : path.join(projectPath, ignorePath);
            if (!fs.existsSync(absoluteIgnorePath)) {
              NotificationManager.showError(t("extractSetup.errorIgnoreScopePathInvalid", ignorePath));
              return;
            }
          }
        }
        settled = true;
        panel.dispose();
        resolve(raw);
      } else if (msg.type === "cancel") {
        settled = true;
        panel.dispose();
        resolve(null);
      } else if (msg.type === "error") {
        const detail = typeof msg.value === "string" ? msg.value : "Invalid form value";
        NotificationManager.showError(detail);
      }
    });

    panel.onDidDispose(() => {
      dispose.dispose();
      if (!settled) {
        resolve(null);
      }
    });

    panel.reveal(vscode.ViewColumn.One);
  });
}
