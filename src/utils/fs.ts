import * as fs from "fs/promises";
import path from "path";
import * as vscode from "vscode";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { isValidI18nCallablePath } from "@/utils/regex";
import { getCacheConfig } from "./config";

const langPathRegex = /^(lang|language|i18n|l10n|locale|translation|translate|message|intl|fanyi)s?$/i;
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
  if (!dir || !targetPath) {
    return false;
  }
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

export async function detectI18nProject(dirPath: string): Promise<boolean> {
  let score = 0;
  const signals: string[] = [];

  async function exists(p: string) {
    try {
      await fs.stat(p);
      return true;
    } catch {
      return false;
    }
  }

  // 扩展的 i18n 库列表
  const i18nLibs = [
    "vue-i18n",
    "@intlify/core",
    "i18next",
    "react-i18next",
    "@ngx-translate/core",
    "svelte-i18n",
    "react-intl",
    "formatjs",
    "polyglot",
    "lingui",
    "next-intl",
    "vuex-i18n"
  ];

  // 扩展的配置文件列表
  const configFiles = [
    "i18n.config.js",
    "i18n.config.ts",
    ".i18nrc",
    ".i18nrc.json",
    "next-i18next.config.js",
    "nuxt-i18n.config.js",
    "lingui.config.js"
  ];

  // 1️⃣ 一级信号：package.json 中依赖
  const pkgPath = path.join(dirPath, "package.json");
  if (await exists(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        keywords?: string[];
      };
      const deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies
      };

      for (const lib of i18nLibs) {
        if (deps?.[lib]) {
          score += 5;
          signals.push(`依赖了 ${lib}`);
        }
      }

      if (pkg.keywords?.some((k: string) => k.includes("i18n") || k.includes("intl")) ?? false) {
        score += 2;
        signals.push("package.json 包含 i18n 相关关键词");
      }
    } catch {
      // ignore JSON parse errors
    }
  }

  // 2️⃣ 二级信号：配置文件
  for (const file of configFiles) {
    const filePath = path.join(dirPath, file);
    if (await exists(filePath)) {
      // 验证配置文件是否包含 i18n 相关内容
      try {
        const content = await fs.readFile(filePath, "utf8");
        if (content.includes("i18n") || content.includes("locale") || content.includes("language")) {
          score += 5;
          signals.push(`存在配置文件 ${file} (且包含 i18n 相关内容)`);
        } else {
          score += 3;
          signals.push(`存在配置文件 ${file}`);
        }
      } catch {
        score += 3;
        signals.push(`存在配置文件 ${file}`);
      }
    }
  }

  // 3️⃣ 三级信号：常见框架特定的 i18n 文件
  const frameworkFiles = [
    "messages.js",
    "messages.ts", // React Intl
    "lang.js",
    "lang.ts", // Vue I18n
    "i18n.js",
    "i18n.ts" // 通用
  ];

  for (const file of frameworkFiles) {
    const filePath = path.join(dirPath, file);
    if (await exists(filePath)) {
      try {
        const content = await fs.readFile(filePath, "utf8");
        if (content.includes("i18n") || content.includes("locale") || content.includes("language")) {
          score += 2;
          signals.push(`存在框架文件 ${file} (且包含 i18n 相关内容)`);
        }
      } catch {
        // 忽略读取错误
      }
    }
  }

  // 判定阈值（调整为 8 分以提高准确性）
  NotificationManager.logToOutput("检测 i18n 项目得分：" + score);
  NotificationManager.logToOutput("检测 i18n 项目信号：" + signals.join(", "));
  const isI18nProject = score >= 3;
  return isI18nProject;
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
