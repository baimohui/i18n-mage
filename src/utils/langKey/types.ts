import { LANG_CODE_MAPPINGS } from "./constants";

export interface LangKeyIntro {
  cnName: string;
  enName: string;
  ggCode: string;
  tcCode: string;
  bdCode: string;
  dlCode: string;
}

export type LangKey = keyof typeof LANG_CODE_MAPPINGS;
