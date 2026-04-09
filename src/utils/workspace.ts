import * as vscode from "vscode";
import path from "path";

type ScopeLike = vscode.ConfigurationScope | string | undefined;

const GLOBAL_SCOPE_KEY = "__global__";

type UriLike = {
  scheme?: string;
  fsPath?: string;
};

function normalizePathForCompare(targetPath: string): string {
  const normalizedPath = path.normalize(path.resolve(targetPath));
  return process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
}

function extractUriLike(input: unknown): UriLike | undefined {
  if (input === null || input === undefined || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (typeof value.fsPath === "string") {
    return value as UriLike;
  }
  if (value.uri !== undefined && value.uri !== null && typeof value.uri === "object") {
    return extractUriLike(value.uri);
  }
  if (value.document !== undefined && value.document !== null && typeof value.document === "object") {
    return extractUriLike(value.document);
  }
  return undefined;
}

function extractFilePath(input: ScopeLike): string | undefined {
  if (typeof input === "string") {
    return input.trim() === "" ? undefined : input;
  }
  const uriLike = extractUriLike(input);
  if (uriLike && typeof uriLike.fsPath === "string" && uriLike.fsPath.trim() !== "") {
    return uriLike.fsPath;
  }
  return undefined;
}

function getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
  return vscode.workspace.workspaceFolders ?? [];
}

function pickWorkspaceFolderByPath(filePath: string): vscode.WorkspaceFolder | undefined {
  const normalizedTarget = normalizePathForCompare(filePath);
  let matched: vscode.WorkspaceFolder | undefined;
  let matchedLength = -1;
  for (const folder of getWorkspaceFolders()) {
    const rootPath = folder.uri.fsPath;
    if (typeof rootPath !== "string" || rootPath.trim() === "") continue;
    const normalizedRoot = normalizePathForCompare(rootPath);
    const isSame = normalizedTarget === normalizedRoot;
    const isChild = normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
    if ((isSame || isChild) && normalizedRoot.length > matchedLength) {
      matched = folder;
      matchedLength = normalizedRoot.length;
    }
  }
  return matched;
}

function getActiveEditorFilePath(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const uriLike = extractUriLike(editor.document);
  if (!uriLike || uriLike.scheme !== "file") return undefined;
  return uriLike.fsPath;
}

export function getWorkspaceFolderByPath(filePath: string): vscode.WorkspaceFolder | undefined {
  if (typeof filePath !== "string" || filePath.trim() === "" || !path.isAbsolute(filePath)) {
    return undefined;
  }
  return pickWorkspaceFolderByPath(filePath);
}

export function getWorkspaceFolder(scope?: ScopeLike): vscode.WorkspaceFolder | undefined {
  const targetPath = extractFilePath(scope);
  if (typeof targetPath === "string" && path.isAbsolute(targetPath)) {
    const byPath = pickWorkspaceFolderByPath(targetPath);
    if (byPath) return byPath;
  }

  const activeFilePath = getActiveEditorFilePath();
  if (typeof activeFilePath === "string" && path.isAbsolute(activeFilePath)) {
    const byActiveEditor = pickWorkspaceFolderByPath(activeFilePath);
    if (byActiveEditor) return byActiveEditor;
  }

  return getWorkspaceFolders()[0];
}

export function getWorkspaceScope(scope?: ScopeLike): vscode.Uri | undefined {
  const folder = getWorkspaceFolder(scope);
  return folder?.uri;
}

export function getWorkspaceRootPath(scope?: ScopeLike): string {
  const folder = getWorkspaceFolder(scope);
  return folder?.uri.fsPath ?? "";
}

export function getWorkspaceScopeKey(scope?: ScopeLike): string {
  const rootPath = getWorkspaceRootPath(scope);
  if (rootPath.trim() === "") return GLOBAL_SCOPE_KEY;
  return normalizePathForCompare(rootPath);
}
