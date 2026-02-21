import * as vscode from "vscode";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { clearConfigCache, getConfig, setConfig } from "@/utils/config";
import { toRelativePath } from "@/utils/fs";
import { t } from "@/utils/i18n";
import { getLangCode, LANG_CODE_MAPPINGS } from "@/utils/langKey";

const BOOTSTRAP_KEY_PREFIX = "extract.bootstrapConfig.v2";

type BootstrapRaw = Partial<ExtractBootstrapConfig> & {
  fileExtensionsText?: string;
  translationFunctionNamesText?: string;
  stopWordsText?: string;
  stopPrefixesText?: string;
  targetLanguagesText?: string;
  vueTemplateIncludeAttrsText?: string;
  vueTemplateExcludeAttrsText?: string;
};

export interface ExtractBootstrapConfig {
  framework: string;
  languagePath: string;
  fileExtensions: string[];
  translationFunctionNames: string[];
  vueTemplateFunctionName: string;
  vueScriptFunctionName: string;
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
  importStatement: string;
  extractScopePath: string;
  targetLanguages: string[];
  vueTemplateIncludeAttrs: string[];
  vueTemplateExcludeAttrs: string[];
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
    translationFunctionNames: ["t"],
    vueTemplateFunctionName: "t",
    vueScriptFunctionName: "t",
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
    importStatement: 'import { t } from "@/i18n";',
    extractScopePath: "",
    targetLanguages: getDefaultTargetLanguages(),
    vueTemplateIncludeAttrs: [],
    vueTemplateExcludeAttrs: ["key", "ref", "prop", "value", "class", "style", "id", "for", "type", "name", "src", "href", "to"]
  };
}

function parseCsvText(input: string | undefined) {
  if (typeof input !== "string") return [];
  return input
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function sanitizeBootstrapConfig(raw: BootstrapRaw | undefined): ExtractBootstrapConfig {
  const defaults = defaultBootstrapConfig();
  if (!raw) return defaults;

  const fileExtensions = Array.isArray(raw.fileExtensions)
    ? raw.fileExtensions
    : parseCsvText(raw.fileExtensionsText).map(ext => (ext.startsWith(".") ? ext : `.${ext}`));

  const translationFunctionNames = Array.isArray(raw.translationFunctionNames)
    ? raw.translationFunctionNames
    : parseCsvText(raw.translationFunctionNamesText);

  const stopWords = Array.isArray(raw.stopWords) ? raw.stopWords : parseCsvText(raw.stopWordsText);
  const stopPrefixes = Array.isArray(raw.stopPrefixes) ? raw.stopPrefixes : parseCsvText(raw.stopPrefixesText);
  const targetLanguages = Array.isArray(raw.targetLanguages) ? raw.targetLanguages : parseCsvText(raw.targetLanguagesText);
  const vueTemplateIncludeAttrs = Array.isArray(raw.vueTemplateIncludeAttrs)
    ? raw.vueTemplateIncludeAttrs
    : parseCsvText(raw.vueTemplateIncludeAttrsText);
  const vueTemplateExcludeAttrs = Array.isArray(raw.vueTemplateExcludeAttrs)
    ? raw.vueTemplateExcludeAttrs
    : parseCsvText(raw.vueTemplateExcludeAttrsText);

  const config: ExtractBootstrapConfig = {
    framework: typeof raw.framework === "string" && raw.framework.trim() ? raw.framework.trim() : defaults.framework,
    languagePath: typeof raw.languagePath === "string" && raw.languagePath.trim() ? raw.languagePath.trim() : defaults.languagePath,
    fileExtensions: fileExtensions.length > 0 ? fileExtensions : defaults.fileExtensions,
    translationFunctionNames: translationFunctionNames.length > 0 ? translationFunctionNames : defaults.translationFunctionNames,
    vueTemplateFunctionName:
      typeof raw.vueTemplateFunctionName === "string" && raw.vueTemplateFunctionName.trim()
        ? raw.vueTemplateFunctionName.trim()
        : defaults.vueTemplateFunctionName,
    vueScriptFunctionName:
      typeof raw.vueScriptFunctionName === "string" && raw.vueScriptFunctionName.trim()
        ? raw.vueScriptFunctionName.trim()
        : defaults.vueScriptFunctionName,
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
    importStatement:
      typeof raw.importStatement === "string" && raw.importStatement.trim() ? raw.importStatement.trim() : defaults.importStatement,
    extractScopePath: typeof raw.extractScopePath === "string" ? raw.extractScopePath.trim() : defaults.extractScopePath,
    targetLanguages: targetLanguages.length > 0 ? targetLanguages : defaults.targetLanguages,
    vueTemplateIncludeAttrs: vueTemplateIncludeAttrs.map(item => item.toLowerCase()),
    vueTemplateExcludeAttrs:
      vueTemplateExcludeAttrs.length > 0 ? vueTemplateExcludeAttrs.map(item => item.toLowerCase()) : defaults.vueTemplateExcludeAttrs
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

function getProjectBootstrapKey(projectPath: string) {
  const normalized = process.platform === "win32" ? path.normalize(projectPath).toLowerCase() : path.normalize(projectPath);
  const digest = createHash("sha1").update(normalized).digest("hex");
  return `${BOOTSTRAP_KEY_PREFIX}.${digest}`;
}

export function getStoredBootstrapConfig(context: vscode.ExtensionContext, projectPath: string) {
  const key = getProjectBootstrapKey(projectPath);
  return context.globalState.get<ExtractBootstrapConfig>(key);
}

async function setStoredBootstrapConfig(context: vscode.ExtensionContext, projectPath: string, config: ExtractBootstrapConfig) {
  const key = getProjectBootstrapKey(projectPath);
  await context.globalState.update(key, config);
}

export async function ensureBootstrapConfig(params: {
  context: vscode.ExtensionContext;
  projectPath: string;
  hasDetectedLangs: boolean;
  initialExtractScopePath?: string;
}): Promise<ExtractBootstrapConfig | null> {
  const stored = getStoredBootstrapConfig(params.context, params.projectPath);
  const scopedDefaults = (defaults: ExtractBootstrapConfig) =>
    sanitizeBootstrapConfig({
      ...defaults,
      extractScopePath:
        typeof params.initialExtractScopePath === "string" && params.initialExtractScopePath.trim().length > 0
          ? params.initialExtractScopePath.trim()
          : defaults.extractScopePath
    });

  if (params.hasDetectedLangs) {
    const defaults = scopedDefaults(getDetectedProjectDefaults(params.context, params.projectPath));
    const raw = await openBootstrapWebview(params.context, defaults, true, params.projectPath);
    if (raw === null) return null;
    const config = sanitizeBootstrapConfig(raw);
    await applyDetectedConfigs(config);
    await setStoredBootstrapConfig(params.context, params.projectPath, config);
    return config;
  }

  const defaults = scopedDefaults(stored ? sanitizeBootstrapConfig(stored) : defaultBootstrapConfig());
  const raw = await openBootstrapWebview(params.context, defaults, false, params.projectPath);
  if (raw === null) return null;
  const config = sanitizeBootstrapConfig(raw);

  await applyKnownConfigs(config, params.projectPath);
  await ensureTranslationFiles(config, params.projectPath);
  await setStoredBootstrapConfig(params.context, params.projectPath, config);
  return config;
}

function getDetectedProjectDefaults(context: vscode.ExtensionContext, projectPath: string): ExtractBootstrapConfig {
  const inferred = inferBootstrapConfigFromCurrent(projectPath);
  const stored = getStoredBootstrapConfig(context, projectPath);
  if (!stored) return inferred;
  return sanitizeBootstrapConfig({
    ...inferred,
    importStatement: stored.importStatement || inferred.importStatement,
    extractScopePath: stored.extractScopePath || inferred.extractScopePath,
    onlyExtractSourceLanguageText: stored.onlyExtractSourceLanguageText ?? inferred.onlyExtractSourceLanguageText,
    vueTemplateFunctionName: stored.vueTemplateFunctionName || inferred.vueTemplateFunctionName,
    vueScriptFunctionName: stored.vueScriptFunctionName || inferred.vueScriptFunctionName,
    vueTemplateIncludeAttrs: stored.vueTemplateIncludeAttrs ?? inferred.vueTemplateIncludeAttrs,
    vueTemplateExcludeAttrs: stored.vueTemplateExcludeAttrs ?? inferred.vueTemplateExcludeAttrs
  });
}

function inferBootstrapConfigFromCurrent(projectPath: string): ExtractBootstrapConfig {
  const defaults = defaultBootstrapConfig();
  const languagePath = getConfig<string>("workspace.languagePath", defaults.languagePath);
  const languagePathAbs = path.isAbsolute(languagePath) ? languagePath : path.join(projectPath, languagePath);

  return sanitizeBootstrapConfig({
    ...defaults,
    framework: getConfig<string>("i18nFeatures.framework", defaults.framework),
    languagePath: toRelativePath(languagePathAbs),
    fileExtensions: getConfig<string[]>("analysis.fileExtensions", defaults.fileExtensions),
    translationFunctionNames: getConfig<string[]>("i18nFeatures.translationFunctionNames", defaults.translationFunctionNames),
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
    extractScopePath: defaults.extractScopePath
  });
}

async function applyKnownConfigs(config: ExtractBootstrapConfig, projectPath: string) {
  const langPath = path.isAbsolute(config.languagePath) ? config.languagePath : path.join(projectPath, config.languagePath);

  await setConfig("i18nFeatures.framework", config.framework as never);
  await setConfig("workspace.languagePath", toRelativePath(langPath));
  await setConfig("analysis.fileExtensions", config.fileExtensions);
  const functionNames = Array.from(
    new Set(
      [...config.translationFunctionNames, config.vueTemplateFunctionName, config.vueScriptFunctionName]
        .map(item => item.trim())
        .filter(Boolean)
    )
  );
  await setConfig("i18nFeatures.translationFunctionNames", functionNames);
  await setConfig("writeRules.keyPrefix", config.keyPrefix);
  await setConfig("writeRules.languageStructure", config.languageStructure);
  await setConfig("writeRules.sortRule", config.sortRule);
  await setConfig("writeRules.keyStrategy", config.keyStrategy);
  await setConfig("writeRules.keyStyle", config.keyStyle);
  await setConfig("writeRules.maxKeyLength", config.maxKeyLength);
  await setConfig("writeRules.invalidKeyStrategy", config.invalidKeyStrategy);
  await setConfig("writeRules.indentType", config.indentType);
  await setConfig("writeRules.indentSize", config.indentSize);
  await setConfig("writeRules.quoteStyleForKey", config.quoteStyleForKey);
  await setConfig("writeRules.quoteStyleForValue", config.quoteStyleForValue);
  await setConfig("writeRules.stopWords", config.stopWords);
  await setConfig("writeRules.stopPrefixes", config.stopPrefixes);
  await setConfig("translationServices.ignorePossibleVariables", config.ignorePossibleVariables);
  await setConfig("translationServices.referenceLanguage", config.referenceLanguage, "global");
  clearConfigCache("workspace.languagePath");
  clearConfigCache("analysis.fileExtensions");
  clearConfigCache("i18nFeatures.translationFunctionNames");
  clearConfigCache("i18nFeatures.framework");
  clearConfigCache("writeRules");
  clearConfigCache("translationServices.referenceLanguage");
  clearConfigCache("translationServices.ignorePossibleVariables");
}

async function applyDetectedConfigs(config: ExtractBootstrapConfig) {
  await setConfig("analysis.fileExtensions", config.fileExtensions);
  const functionNames = Array.from(
    new Set(
      [...config.translationFunctionNames, config.vueTemplateFunctionName, config.vueScriptFunctionName]
        .map(item => item.trim())
        .filter(Boolean)
    )
  );
  await setConfig("i18nFeatures.translationFunctionNames", functionNames);
  clearConfigCache("analysis.fileExtensions");
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
  projectPath: string
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
          vscode.window.showErrorMessage("Invalid form value");
          return;
        }
        const parsed = sanitizeBootstrapConfig(raw);
        if (parsed.extractScopePath.trim().length > 0) {
          const absoluteScopePath = path.isAbsolute(parsed.extractScopePath)
            ? parsed.extractScopePath
            : path.join(projectPath, parsed.extractScopePath);
          if (!fs.existsSync(absoluteScopePath)) {
            vscode.window.showErrorMessage(t("extractSetup.errorExtractScopePathInvalid", parsed.extractScopePath));
            return;
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
        vscode.window.showErrorMessage(detail);
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
