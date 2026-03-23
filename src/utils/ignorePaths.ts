import { getCacheConfig, getConfig } from "./config";

function mergeIgnoredPaths(current: string[] = [], legacyFiles: string[] = [], legacyDirectories: string[] = []): string[] {
  const merged = [...current];
  for (const item of [...legacyFiles, ...legacyDirectories]) {
    if (item && !merged.includes(item)) {
      merged.push(item);
    }
  }
  return merged;
}

export function getIgnoredPathsFromCache(): string[] {
  const ignoredPaths = getCacheConfig<string[]>("workspace.ignoredPaths", []) ?? [];
  const ignoredFiles = getCacheConfig<string[]>("workspace.ignoredFiles", []) ?? [];
  const ignoredDirectories = getCacheConfig<string[]>("workspace.ignoredDirectories", []) ?? [];
  return mergeIgnoredPaths(ignoredPaths, ignoredFiles, ignoredDirectories);
}

export function getIgnoredPathsFromConfig(): string[] {
  const ignoredPaths = getConfig<string[]>("workspace.ignoredPaths", []) ?? [];
  const ignoredFiles = getConfig<string[]>("workspace.ignoredFiles", []) ?? [];
  const ignoredDirectories = getConfig<string[]>("workspace.ignoredDirectories", []) ?? [];
  return mergeIgnoredPaths(ignoredPaths, ignoredFiles, ignoredDirectories);
}
