import { getConfig } from "@/utils/config";

export const PREVIEW_CHANGE_SCOPE = {
  excelImport: "excel-import",
  hardcodedExtract: "hardcoded-extract",
  fix: "fix",
  retranslate: "retranslate",
  rewrite: "rewrite",
  pasteEntries: "paste-entries"
} as const;

export type PreviewChangeScope = (typeof PREVIEW_CHANGE_SCOPE)[keyof typeof PREVIEW_CHANGE_SCOPE];

const DEFAULT_PREVIEW_CHANGE_SCOPES: PreviewChangeScope[] = Object.values(PREVIEW_CHANGE_SCOPE);

function normalizePreviewScopes(scopes: unknown): PreviewChangeScope[] {
  if (!Array.isArray(scopes)) return DEFAULT_PREVIEW_CHANGE_SCOPES;
  const allowed = new Set(DEFAULT_PREVIEW_CHANGE_SCOPES);
  return scopes.filter((item): item is PreviewChangeScope => typeof item === "string" && allowed.has(item as PreviewChangeScope));
}

export function getPreviewChangeScopes(): PreviewChangeScope[] {
  const config = getConfig<PreviewChangeScope[]>("general.previewChangeScopes", DEFAULT_PREVIEW_CHANGE_SCOPES);
  return normalizePreviewScopes(config);
}

export function shouldPreviewChange(scope: PreviewChangeScope): boolean {
  const legacySetting = getConfig<boolean | undefined>("general.previewChanges");
  if (typeof legacySetting === "boolean" && legacySetting === false) return false;
  return getPreviewChangeScopes().includes(scope);
}
