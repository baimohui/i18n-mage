const fs = require("fs");
const path = require("path");

const deleteFolderRecursive = (dirPath) => {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach(file => {
      const curPath = path.join(dirPath, file);
      fs.lstatSync(curPath).isDirectory() ? deleteFolderRecursive(curPath) : fs.unlinkSync(curPath);
    });
    fs.rmdirSync(dirPath);
  }
}

const createFolderRecursive = (dirPath) => {
  if (fs.existsSync(dirPath)) return;
  let parentPath = path.dirname(dirPath);
  !fs.existsSync(parentPath) && createFolderRecursive(parentPath);
  fs.mkdirSync(dirPath);
}

const getPossibleLangDirList = (dirPath, list = []) => {
  const results = fs.readdirSync(dirPath, { withFileTypes: true });
  for (let i = 0; i < results.length; i++) {
    const targetName = results[i].name;
    const targetPath = path.join(dirPath, targetName);
    const ignoredDirList = ["dist", "node_modules", "img", "image", "css", "asset", "langChecker", ".vscode"];
    if (results[i].isDirectory()) {
      const hasLangName = ["lang", "i18n", "translat", "fanyi"].some(key => targetName.includes(key))
      if (hasLangName) {
        list.push(targetPath)
      } else if (ignoredDirList.every(key => !targetName.includes(key))) {
        getPossibleLangDirList(targetPath, list);
      }
    }
  }
  return list;
}

const isPathInsideDirectory = (dir, targetPath) => {
  // 获取绝对路径
  const absoluteDir = path.resolve(dir);
  const absoluteTargetPath = path.resolve(targetPath);
  // 计算相对路径
  const relativePath = path.relative(absoluteDir, absoluteTargetPath);
  // 如果相对路径不以 ".." 开头，则 targetPath 是在 dir 目录下
  const isInside = !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  return isInside;
}

module.exports = {
  deleteFolderRecursive,
  createFolderRecursive,
  getPossibleLangDirList,
  isPathInsideDirectory
}