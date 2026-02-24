export interface ExtractCandidate {
  id: string;
  file: string;
  text: string;
  start: number;
  end: number;
  raw: string;
  context: "js-string" | "vue-script-string" | "vue-template-attr" | "vue-template-text";
  attrName?: string;
}

export interface ExtractScanResult {
  candidates: ExtractCandidate[];
  scannedFiles: number;
}
