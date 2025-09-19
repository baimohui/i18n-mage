import * as vscode from "vscode";

export async function selectProperty(uri: vscode.Uri, key: string) {
  // 1. 拆分并还原转义的点
  const isEndWithNum = key.match(/\.(\d+)$/);
  const parts = key.split(/(?<!\\)\./).map(p => p.replace(/\\\./g, "."));
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const text = doc.getText();
  let searchStart = 0;
  let rangeStart: number | undefined;
  // 2. 对于多层嵌套重复查找大括号范围
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    const isLast = i === parts.length - 1;
    const isBeforeLast = i === parts.length - 2;
    const keyEsc = escapeReg(key);
    const lookaround = `(?<![\\w$])["']?${keyEsc}["']?(?![\\w$])`;
    const suffix = isLast ? `` : `\\s*[\\{\\[]`;
    const pat = new RegExp(lookaround + `\\s*:` + suffix);
    const m = pat.exec(text.slice(searchStart));
    // 未找到属性 key
    if (!m) {
      return;
    }
    const matchIndex = searchStart + m.index;
    if (isLast || (isBeforeLast && isEndWithNum)) {
      // 最后一级，直接定位属性名开始
      const offset = matchIndex + m[0].indexOf(key);
      rangeStart = offset;
      break;
    } else {
      // 非最后一级，进入对象体
      const objStart = matchIndex + m[0].length;
      const subText = text.slice(objStart);
      const closeIdx = findMatchingBrace(subText);
      // 对象 key 的大括号不匹配
      if (closeIdx < 0) {
        return;
      }
      // 更新下一轮搜索的起点，只在当前对象内部查找
      searchStart = objStart;
      // 将搜索结束设置为 objStart + closeIdx，以便不越界
      // 通过修改 textSlice 在 exec 时自动限制
    }
  }
  // 3. 设置选区并高亮属性名
  if (rangeStart !== undefined) {
    const startPos = doc.positionAt(rangeStart);
    const endPos = startPos.translate(0, parts[parts.length - (isEndWithNum ? 2 : 1)].length);
    editor.selection = new vscode.Selection(startPos, endPos);
    editor.revealRange(new vscode.Range(startPos, endPos));
  }
}

// 转义正则元字符
function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 找到字符串中第一个 '}' 与对应 '{' 的匹配位置
function findMatchingBrace(text: string): number {
  let depth = 1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
