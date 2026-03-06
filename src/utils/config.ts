import * as vscode from "vscode";

const NAMESPACE = "i18n-mage";

type Scope = "global" | "workspace" | "workspaceFolder";

const cachedConfig: Record<string, any> = {};
let configWriteQueue: Promise<void> = Promise.resolve();

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

export function getConfig<T = any>(key: string, defaultValue?: T, scope?: vscode.ConfigurationScope): T {
  return vscode.workspace.getConfiguration(NAMESPACE, scope).get<T>(key, defaultValue as T);
}

export async function setConfig<T = any>(
  key: string,
  value: T,
  targetScope: Scope = "workspace", // 默认写入当前项目
  scope?: vscode.ConfigurationScope // 可选传入 workspaceFolder 或 Uri
): Promise<void> {
  const configTarget =
    targetScope === "global"
      ? vscode.ConfigurationTarget.Global
      : targetScope === "workspace"
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.WorkspaceFolder;
  const task = async () => {
    const config = vscode.workspace.getConfiguration(NAMESPACE, scope);
    await updateConfigWithRetry(config, key, value, configTarget);
  };
  const queuedTask = configWriteQueue.then(task, task);
  configWriteQueue = queuedTask.catch(() => undefined);
  await queuedTask;
}

export function getCacheConfig<T = any>(key: string, defaultValue?: T) {
  if (!Object.hasOwn(cachedConfig, key)) {
    cachedConfig[key] = getConfig<T>(key, defaultValue as T);
  }
  return cachedConfig[key] as T;
}

export function setCacheConfig<T = any>(key: string, value: T) {
  cachedConfig[key] = value;
}

export function clearConfigCache(key: string) {
  if (Object.hasOwn(cachedConfig, key)) {
    delete cachedConfig[key];
  } else {
    for (const k in cachedConfig) {
      if (k.startsWith(key)) {
        delete cachedConfig[k];
      }
    }
  }
}
