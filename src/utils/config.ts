import * as vscode from "vscode";

const NAMESPACE = "i18n-mage";

type Scope = "global" | "workspace" | "workspaceFolder";

const cachedConfig: Record<string, any> = {};

// let cachedConfig: {
//   fileExtensions: string[];
//   languagePath: string;
//   ignoredFiles: string[];
//   ignoredDirectories: string[];
//   framework: I18nFramework;
//   defaultNamespace: string;
//   tFuncNames: string[];
//   interpolationBrackets: "single" | "double" | "auto";
//   namespaceSeparator: "." | "auto" | ":";
//   enableKeyTagRule: boolean;
//   enablePrefixTagRule: boolean;
//   analysisOnSave: boolean;
//   fileSizeSkipThresholdKB: number;
//   ignoreCommentedCode: boolean;
//   languageFileParser: "auto" | "json5" | "eval";
// } | null = null;

export function getConfig<T = any>(key: string, defaultValue?: T, scope?: vscode.ConfigurationScope): T {
  return vscode.workspace.getConfiguration(NAMESPACE, scope).get<T>(key, defaultValue as T);
}

export async function setConfig<T = any>(
  key: string,
  value: T,
  targetScope: Scope = "workspace", // 默认写入当前项目
  scope?: vscode.ConfigurationScope // 可选传入 workspaceFolder 或 Uri
): Promise<void> {
  const config = vscode.workspace.getConfiguration(NAMESPACE, scope);
  const configTarget =
    targetScope === "global"
      ? vscode.ConfigurationTarget.Global
      : targetScope === "workspace"
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.WorkspaceFolder;

  await config.update(key, value, configTarget);
}

export function getCacheConfig<T = any>(key: string, defaultValue?: T) {
  if (!Object.hasOwn(cachedConfig, key)) {
    cachedConfig[key] = getConfig<T>(key, defaultValue as T);
  }
  return cachedConfig[key] as T;
}

export function clearConfigCache(key: string) {
  delete cachedConfig[key];
}
