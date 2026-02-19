export interface ExtractCandidate {
  id: string;
  file: string;
  text: string;
  start: number;
  end: number;
  raw: string;
  context: "js-string" | "vue-script-string";
}

export interface ExtractSessionConfig {
  translationImportTemplate: string;
  onlyHardcodedLanguageText: boolean;
  targetLanguages: string[];
  vueTemplateFunctionName: string;
  vueScriptFunctionName: string;
}

export interface ExtractScanResult {
  candidates: ExtractCandidate[];
  scannedFiles: number;
}
