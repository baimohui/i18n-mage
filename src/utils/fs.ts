import * as fs from "fs/promises";
import path from "path";
import * as vscode from "vscode";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { isValidI18nCallablePath } from "@/utils/regex";
import { getCacheConfig } from "./config";

const langPathRegex = /\b(lang|language|i18n|l10n|locale|translation|translate|message|intl|fanyi)s?\b/i;
const localeCodeRegex = /(^|^\w.*\b)[a-z]{2,3}([-_][a-z]{2,4})?$/i;
const localeFileRegex = /(^|^\w.*\b)([a-z]{2,3}(?:[-_][a-z]{2,4})?)\.(js|ts|json|json5|mjs|cjs)$/i;

const MIN_ENTRIES = 1;

export async function deleteFolderRecursive(dirPath: string): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    await Promise.all(
      entries.map(async entry => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await deleteFolderRecursive(fullPath);
        } else {
          await fs.unlink(fullPath);
        }
      })
    );
    await fs.rmdir(dirPath);
  } catch (err) {
    NotificationManager.showError(t("common.progress.error", err instanceof Error ? err.message : t("common.unknownError")));
  }
}

export async function createFolderRecursive(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    NotificationManager.showError(t("common.progress.error", err instanceof Error ? err.message : t("common.unknownError")));
  }
}

export async function getPossibleLangPaths(rootDir: string): Promise<string[]> {
  const results = new Set<string>();

  async function traverse(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const basename = path.basename(dir);
      const subdirs = entries.filter(e => e.isDirectory());
      const files = entries.filter(e => e.isFile());

      const validSubdirLen = subdirs.filter(d => localeCodeRegex.test(d.name)).length;
      const validFileLen = files.filter(f => localeFileRegex.test(f.name)).length;

      if (
        langPathRegex.test(basename) &&
        ((validSubdirLen >= MIN_ENTRIES && validSubdirLen >= subdirs.length - validSubdirLen) ||
          (validFileLen >= MIN_ENTRIES && validFileLen >= files.length - validFileLen))
      ) {
        results.add(dir);
      }

      for (const sub of subdirs) {
        if (!isValidI18nCallablePath(sub.parentPath)) continue;
        await traverse(path.join(dir, sub.name));
      }
    } catch {
      return;
    }
  }

  await traverse(rootDir);

  const dirs = Array.from(results);
  return dirs.filter(a => !dirs.some(b => a !== b && b.startsWith(a + path.sep)));
}

export function isPathInsideDirectory(dir: string, targetPath: string): boolean {
  // 获取绝对路径
  // if (!path.isAbsolute(dir) || !path.isAbsolute(targetPath)) {
  //   throw new Error("Both dir and targetPath must be absolute paths");
  // }
  if (!path.isAbsolute(dir)) {
    dir = toAbsolutePath(dir);
  }
  if (!path.isAbsolute(targetPath)) {
    targetPath = toAbsolutePath(targetPath);
  }
  const absoluteDir = path.resolve(dir);
  const absoluteTargetPath = path.resolve(targetPath);
  // 计算相对路径
  const relativePath = path.relative(absoluteDir, absoluteTargetPath);
  // 如果相对路径不以 ".." 开头，则 targetPath 是在 dir 目录下
  const isInside = !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  return isInside;
}

export async function isLikelyProjectPath(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) return false;
    const packageJsonPath = path.join(dirPath, "package.json");
    const srcPath = path.join(dirPath, "src");
    const checks = await Promise.allSettled([fs.stat(packageJsonPath), fs.stat(srcPath)]);
    const hasPkg = checks[0].status === "fulfilled" && checks[0].value.isFile();
    const hasSrc = checks[1].status === "fulfilled" && checks[1].value.isDirectory();
    return hasPkg || hasSrc;
  } catch {
    return false;
  }
}

/**
 * 将相对路径（相对于工作区根目录）解析为绝对路径。
 * @param relativePath 相对路径
 */
export function toAbsolutePath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (root === undefined) return "";
  return path.resolve(root, relativePath);
}

/**
 * 将绝对路径转换为相对于当前 workspace 的相对路径。
 * @param absolutePath 要转换的绝对路径
 */
export function toRelativePath(absolutePath: string): string {
  if (!path.isAbsolute(absolutePath)) {
    return absolutePath;
  }
  const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (root === undefined) return "";
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

export function isSamePath(absolutePath: string, relativePath: string): boolean {
  if (!path.isAbsolute(absolutePath)) {
    return false;
    // throw new Error("absolutePath must be an absolute path");
  }
  const root = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (root === undefined) return false;
  if (!path.isAbsolute(root)) {
    return false;
    // throw new Error("rootDir must be an absolute path");
  }
  const resolvedPath = path.normalize(path.resolve(root, relativePath));
  const normalizedAbsolute = path.normalize(absolutePath);
  if (process.platform === "win32") {
    return resolvedPath.toLowerCase() === normalizedAbsolute.toLowerCase();
  }
  return resolvedPath === normalizedAbsolute;
}

// 获取首段或最后一级目录名（供正则匹配）
export function getFirstOrLastDirName(p: string, isDirectory: boolean): string {
  const segments = path.resolve(p).split(path.sep);
  if (segments.length === 0) return "";
  return isDirectory ? segments[segments.length - 1] : segments[0];
}

// 检测文件大小是否超过 50KB（可调整）
export async function isFileTooLarge(filePath: string): Promise<boolean> {
  const stats = await fs.stat(filePath);
  const { fileSizeSkipThresholdKB } = getCacheConfig();
  return stats.size > fileSizeSkipThresholdKB * 1024;
}

export async function checkPathExists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
