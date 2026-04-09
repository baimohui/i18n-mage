import * as vscode from "vscode";
import { getWorkspaceScope, getWorkspaceScopeKey } from "@/utils/workspace";

const NAMESPACE = "i18n-mage";

type Scope = "global" | "workspace" | "workspaceFolder";

const cachedConfig: Record<string, any> = {};
let configWriteQueue: Promise<void> = Promise.resolve();
const CACHE_KEY_SEPARATOR = "||";

const RETRY_DELAYS_MS = [100, 300];

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function updateConfigWithRetry<T = any>(
  config: vscode.WorkspaceConfiguration,
  key: string,
  value: T,
  target: vscode.ConfigurationTarget
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await config.update(key, value, target);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_DELAYS_MS.length) {
        await delay(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw lastError;
    }
  }
}

function getScopedCacheKey(key: string, scope?: vscode.ConfigurationScope): string {
  return `${getWorkspaceScopeKey(scope)}${CACHE_KEY_SEPARATOR}${key}`;
}

function getRawCacheKey(scopedCacheKey: string): string {
  const separatorIndex = scopedCacheKey.indexOf(CACHE_KEY_SEPARATOR);
  if (separatorIndex < 0) return scopedCacheKey;
  return scopedCacheKey.slice(separatorIndex + CACHE_KEY_SEPARATOR.length);
}

export function getConfig<T = any>(key: string, defaultValue?: T, scope?: vscode.ConfigurationScope): T {
  const resolvedScope = getWorkspaceScope(scope);
  return vscode.workspace.getConfiguration(NAMESPACE, resolvedScope).get<T>(key, defaultValue as T);
}

export async function setConfig<T = any>(
  key: string,
  value: T,
  targetScope: Scope = "workspace", // 默认写入当前项目
  scope?: vscode.ConfigurationScope // 可选传入 workspaceFolder 或 Uri
): Promise<void> {
  const resolvedScope = getWorkspaceScope(scope);
  const configTarget =
    targetScope === "global"
      ? vscode.ConfigurationTarget.Global
      : targetScope === "workspace"
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.WorkspaceFolder;
  const task = async () => {
    const config = vscode.workspace.getConfiguration(NAMESPACE, resolvedScope);
    await updateConfigWithRetry(config, key, value, configTarget);
  };
  const queuedTask = configWriteQueue.then(task, task);
  configWriteQueue = queuedTask.catch(() => undefined);
  await queuedTask;
}

export function getCacheConfig<T = any>(key: string, defaultValue?: T, scope?: vscode.ConfigurationScope) {
  const scopedKey = getScopedCacheKey(key, scope);
  if (!Object.hasOwn(cachedConfig, scopedKey)) {
    cachedConfig[scopedKey] = getConfig<T>(key, defaultValue as T, scope);
  }
  return cachedConfig[scopedKey] as T;
}

export function setCacheConfig<T = any>(key: string, value: T, scope?: vscode.ConfigurationScope) {
  cachedConfig[getScopedCacheKey(key, scope)] = value;
}

export function clearConfigCache(key: string) {
  for (const scopedKey in cachedConfig) {
    const rawKey = getRawCacheKey(scopedKey);
    if (key === "" || rawKey === key || rawKey.startsWith(key)) {
      delete cachedConfig[scopedKey];
    }
  }
}
