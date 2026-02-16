import * as vscode from "vscode";

export interface ExtendedTreeItem extends vscode.TreeItem {
  level?: number;
  root?: string;
  type?: string;
  name?: string;
  key?: string;
  data?: string[];
  meta?: { lang?: string; file?: string };
  stack?: string[];
}

export class FileItem extends vscode.TreeItem {
  constructor(resourceUri: vscode.Uri, range: vscode.Range) {
    super(resourceUri, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "fileItem";
    this.tooltip = `${resourceUri.fsPath}`;
    this.description = `${range.start.line + 1}:${range.start.character + 1}`;
    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [resourceUri, { selection: range }]
    };
  }
}
