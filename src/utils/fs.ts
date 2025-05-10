import fs from "fs";
import path from "path";

const deleteFolderRecursive = (dirPath: string): void => {
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
};

const createFolderRecursive = (dirPath: string): void => {
  if (fs.existsSync(dirPath)) return;
  const parentPath = path.dirname(dirPath);
  if (!fs.existsSync(parentPath)) createFolderRecursive(parentPath);
  fs.mkdirSync(dirPath);
};

const getPossibleLangDirList = (dirPath: string, list: string[] = []): string[] => {
  const results = fs.readdirSync(dirPath, { withFileTypes: true });
  for (let i = 0; i < results.length; i++) {
    const targetName = results[i].name;
    const targetPath = path.join(dirPath, targetName);
    const ignoredDirList = ["dist", "node_modules", "img", "image", "css", "asset", "langChecker", ".vscode"];
    if (results[i].isDirectory()) {
      const hasLangName = ["lang", "i18n", "translat", "fanyi"].some(key => targetName.includes(key));
      if (hasLangName) {
        list.push(targetPath);
      } else if (ignoredDirList.every(key => !targetName.includes(key))) {
        getPossibleLangDirList(targetPath, list);
      }
    }
  }
  return list;
};

const isPathInsideDirectory = (dir: string, targetPath: string): boolean => {
  // 获取绝对路径
  const absoluteDir = path.resolve(dir);
  const absoluteTargetPath = path.resolve(targetPath);
  // 计算相对路径
  const relativePath = path.relative(absoluteDir, absoluteTargetPath);
  // 如果相对路径不以 ".." 开头，则 targetPath 是在 dir 目录下
  const isInside = !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  return isInside;
};

export { deleteFolderRecursive, createFolderRecursive, getPossibleLangDirList, isPathInsideDirectory };
