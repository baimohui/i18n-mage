export interface ExtractSetupWebviewData {
  language: string;
  hasDetectedLangs: boolean;
  availableLanguages: Array<{ code: string; label: string }>;
  defaults: {
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
  };
}
