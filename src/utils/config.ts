import { I18nFramework } from "@/types";
import * as vscode from "vscode";

const NAMESPACE = "i18n-mage";

type Scope = "global" | "workspace" | "workspaceFolder";

let cachedConfig: {
  ignoredFiles: string[];
  ignoredDirectories: string[];
  framework: I18nFramework;
  defaultNamespace: string;
  tFuncNames: string[];
  interpolationBrackets: "single" | "double" | "auto";
  namespaceSeparator: "." | "auto" | ":";
  enableKeyTagRule: boolean;
  enablePrefixTagRule: boolean;
} | null = null;

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

export function getCacheConfig() {
  if (!cachedConfig) {
    cachedConfig = {
      ignoredFiles: getConfig<string[]>("workspace.ignoredFiles", []),
      ignoredDirectories: getConfig<string[]>("workspace.ignoredDirectories", []),
      enableKeyTagRule: getConfig<boolean>("writeRules.enableKeyTagRule", false),
      enablePrefixTagRule: getConfig<boolean>("writeRules.enablePrefixTagRule", false),
      framework: getConfig<I18nFramework>("i18nFeatures.framework"),
      defaultNamespace: getConfig<string>("i18nFeatures.defaultNamespace"),
      tFuncNames: getConfig<string[]>("i18nFeatures.translationFunctionNames", []),
      interpolationBrackets: getConfig<"single" | "double" | "auto">("i18nFeatures.interpolationBrackets", "auto"),
      namespaceSeparator: getConfig<"." | "auto" | ":">("i18nFeatures.namespaceSeparator", "auto")
    };
  }
  return cachedConfig;
}

export function clearConfigCache() {
  cachedConfig = null;
}
