import * as vscode from "vscode";
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

export function getIgnoredPathsFromCache(scope?: vscode.ConfigurationScope): string[] {
  const ignoredPaths = getCacheConfig<string[]>("workspace.ignoredPaths", [], scope) ?? [];
  const ignoredFiles = getCacheConfig<string[]>("workspace.ignoredFiles", [], scope) ?? [];
  const ignoredDirectories = getCacheConfig<string[]>("workspace.ignoredDirectories", [], scope) ?? [];
  return mergeIgnoredPaths(ignoredPaths, ignoredFiles, ignoredDirectories);
}

export function getIgnoredPathsFromConfig(scope?: vscode.ConfigurationScope): string[] {
  const ignoredPaths = getConfig<string[]>("workspace.ignoredPaths", [], scope) ?? [];
  const ignoredFiles = getConfig<string[]>("workspace.ignoredFiles", [], scope) ?? [];
  const ignoredDirectories = getConfig<string[]>("workspace.ignoredDirectories", [], scope) ?? [];
  return mergeIgnoredPaths(ignoredPaths, ignoredFiles, ignoredDirectories);
}
