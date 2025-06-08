import * as vscode from "vscode";

export function getLangAliasCustomMappings(): Record<string, string[]> {
  return vscode.workspace.getConfiguration().get<Record<string, string[]>>("langAliasCustomMappings") ?? {};
}
