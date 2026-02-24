import { ExtractCandidate } from "@/core/extract/types";

export interface ExtractScanConfirmData {
  language: string;
  writeLanguages: string[];
  candidates: Array<
    Omit<ExtractCandidate, "file"> & {
      file: string;
    }
  >;
}
