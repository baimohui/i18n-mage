import { ExtractCandidate } from "@/core/extract/types";

export interface ExtractScanConfirmData {
  language: string;
  candidates: Array<
    Omit<ExtractCandidate, "file"> & {
      file: string;
    }
  >;
}
