import * as vscode from "vscode";

const NAMESPACE = "i18n-mage";

type Scope = "global" | "workspace" | "workspaceFolder";

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
