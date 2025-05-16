import fs from "fs";
import path from "path";

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

export function getPossibleLangDirs(rootDir: string): string[] {
  const langDirs: string[] = [];
  const ignoredDirRegex = /dist|node_modules|img|image|css|asset|^\./i;
  const langDirRegex = /lang|i18n|locale|translat|message|intl|localization|fanyi|语|翻|Sprachen/i;
  function traverse(currentDir: string) {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const dirent of items) {
      const fullPath = path.join(currentDir, dirent.name);
      if (dirent.isDirectory()) {
        if (langDirRegex.test(dirent.name)) {
          langDirs.push(fullPath);
        } else if (!ignoredDirRegex.test(dirent.name)) {
          traverse(fullPath);
        }
      }
    }
  }
  traverse(rootDir);
  return langDirs;
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
