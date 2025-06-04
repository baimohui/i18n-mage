import fs from "fs";
import path from "path";
import { isIgnoredDir } from "@/utils/regex";

export function deleteFolderRecursive(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach(file => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}

export function createFolderRecursive(dirPath: string): void {
  if (fs.existsSync(dirPath)) return;
  const parentPath = path.dirname(dirPath);
  if (!fs.existsSync(parentPath)) createFolderRecursive(parentPath);
  fs.mkdirSync(dirPath);
}

// 只匹配容器目录名：lang、i18n、locale……等关键词
const langDirRegex = /\b(lang|language|i18n|locale|translation|translate|message|intl|fanyi)s?\b/i;
// 严格的区域/语言代码格式
const localeCodeRegex = /^[a-z]{2,3}([-_][a-z]{2,4})?$/i;
// 匹配单文件翻译名及后缀
const localeFileRegex = /^([a-z]{2,3}(?:[-_][A-Za-z]{2,4})?)\.(js|ts|json|json5|mjs|cjs)$/i;
// 最小文件/目录数限制
const MIN_ENTRIES = 2;

export function getPossibleLangDirs(rootDir: string): string[] {
  const results = new Set<string>();
  function traverse(dir: string) {
    const basename = path.basename(dir);
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const subdirs = entries.filter(d => d.isDirectory() && !d.isSymbolicLink());
    const files = entries.filter(d => d.isFile());
    // —— 目录式检测 ——
    // 1. 当前目录名要命中 langDirRegex
    // 2. 且它下面至少有 2 个符合 localeCodeRegex 的子目录
    if (langDirRegex.test(basename) && subdirs.filter(d => localeCodeRegex.test(d.name)).length >= MIN_ENTRIES) {
      results.add(dir);
      // return;
    }
    // —— 文件式检测 ——
    // 当前目录下至少 2 个符合 localeFileRegex 的文件
    if (langDirRegex.test(basename) && files.filter(d => localeFileRegex.test(d.name)).length >= MIN_ENTRIES) {
      results.add(dir);
      // return;
    }
    // —— 继续递归 ——
    for (const d of subdirs) {
      if (isIgnoredDir(d.name)) continue;
      traverse(path.join(dir, d.name));
    }
  }
  traverse(rootDir);
  // 去掉彼此包含的父目录，只保留最深那层
  const dirs = Array.from(results);
  // TODO path.sep 路径分隔符，统一用这个
  return dirs.filter(a => !dirs.some(b => a !== b && b.startsWith(a + path.sep)));
}

export function isPathInsideDirectory(dir: string, targetPath: string): boolean {
  // 获取绝对路径
  const absoluteDir = path.resolve(dir);
  const absoluteTargetPath = path.resolve(targetPath);
  // 计算相对路径
  const relativePath = path.relative(absoluteDir, absoluteTargetPath);
  // 如果相对路径不以 ".." 开头，则 targetPath 是在 dir 目录下
  const isInside = !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  return isInside;
}
