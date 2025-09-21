import { EntryTree, EntryNode, LangDictionary, NamespaceStrategy, NAMESPACE_STRATEGY, DirNode } from "@/types";
import { parseEscapedPath, getPathSegsFromId } from "./stringUtils";

export function genLangTree(tree: EntryTree = {}, content: EntryTree | string[] = {}, type = ""): void {
  Object.keys(content).forEach(key => {
    if (typeof content[key] === "object") {
      tree[key] = {};
      genLangTree(tree[key], content[key] as EntryTree | string[], type);
    } else if (typeof content[key] === "string") {
      tree[key] = type === "string" ? content[key] : content[key].replace(/\s/g, "");
    }
  });
}

export function traverseLangTree(EntryTree: EntryTree | string[], callback: (key: string, value: any) => void, prefix = ""): void {
  Object.keys(EntryTree).forEach(key => {
    if (typeof EntryTree[key] === "object") {
      traverseLangTree(EntryTree[key] as EntryTree | string[], callback, prefix ? `${prefix}.${key}` : key);
    } else {
      callback(prefix + key, EntryTree[key]);
    }
  });
}

export function getLangTree(obj: object | string): string {
  if (typeof obj !== "object") return "";
  return Object.keys(obj).some(key => typeof obj[key] === "object") ? "object" : "string";
}

export function getEntryFromLangTree(EntryTree: EntryTree, key: string): string {
  let res = "";
  const blockList = key.split(".");
  for (let i = 0; i < blockList.length; i++) {
    const prefix = blockList.slice(0, i + 1).join(".");
    if (getLangTree(EntryTree[prefix] as object) === "object") {
      res = getEntryFromLangTree(EntryTree[prefix] as EntryTree, blockList.slice(i + 1).join("."));
      if (res) break;
    } else if (getLangTree(EntryTree[prefix] as string) === "string") {
      res = EntryTree[prefix] as string;
      break;
    }
  }
  return res;
}

export function setValueByEscapedEntryName(EntryTree: EntryTree, escapedPath: string, value: string | undefined): void {
  const pathParts = parseEscapedPath(escapedPath);
  let current = EntryTree;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (current[part] === undefined || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as EntryTree;
  }
  current[pathParts[pathParts.length - 1]] = value as string;
}

export function getValueByAmbiguousEntryName(EntryTree: EntryTree, ambiguousPath: string): string | undefined {
  if (typeof EntryTree !== "object" || EntryTree === null) {
    return undefined;
  }
  const parts = ambiguousPath.split(".");
  const m = parts.length;
  if (m === 0) {
    return undefined;
  }
  const numCombinations = 1 << (m - 1);
  for (let i = 0; i < numCombinations; i++) {
    const split = buildSplit(parts, i, m);
    const value = accessPath(EntryTree, split);
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

export function getCommonFilePaths(fileStructure: DirNode | null): string[] {
  if (!fileStructure) return [];
  const languages = Object.keys(fileStructure.children ?? {});
  if (languages.length === 0) return [];
  function collectPaths(node: Record<string, EntryNode>, basePath: string): string[] {
    const keys = Object.keys(node ?? {});
    let paths: string[] = [];
    for (const key of keys) {
      const firstNode = node[key];
      if (firstNode.type === "file") {
        paths.push(basePath ? `${basePath}/${key}` : key);
      } else if (firstNode.type === "directory") {
        paths = paths.concat(collectPaths(firstNode.children, basePath ? `${basePath}/${key}` : key));
      }
    }
    return paths;
  }
  return collectPaths(fileStructure.children, "");
}

export function getParentKeys(obj: Record<string, any>, nameSeparator = ".", parentKey = "") {
  let keys: string[] = [];
  // 遍历对象的每个键
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      const fullKey = parentKey ? `${parentKey}${nameSeparator}${key}` : key;
      // 如果值是对象，则说明它是父节点，递归遍历其子节点
      if (typeof obj[key] === "object" && obj[key] !== null) {
        keys.push(fullKey); // 记录父节点
        keys = keys.concat(getParentKeys(obj[key] as Record<string, any>, nameSeparator, fullKey)); // 递归遍历子节点
      }
    }
  }
  return keys;
}

export function getFileLocationFromId(id: string, fileStructure: EntryNode): string[] | null {
  const segments = getPathSegsFromId(id);
  const pathSegs: string[] = [];
  let node: EntryNode = fileStructure;
  for (const seg of segments) {
    if (node.type === "directory" && Object.hasOwn(node.children, seg)) {
      pathSegs.push(seg);
      node = node.children[seg];
    } else {
      break;
    }
  }
  if (node.type !== "file") return null; // 路径在结构里不存在
  return pathSegs;
}

export function getContentAtLocation(
  location: string,
  tree: EntryTree,
  dictionary: LangDictionary,
  namespaceStrategy: NamespaceStrategy
): EntryTree | null {
  function helper(node: EntryTree) {
    if (typeof node === "string") {
      // 叶子节点：直接判断是否有效
      return dictionary[node].fileScope === location ? node : null;
    }
    // 非叶子节点：递归处理子节点
    const result = Array.isArray(node) ? [] : {};
    for (const key in node) {
      const child = helper(node[key] as EntryTree);
      if (child !== null) {
        result[key] = child;
      }
    }
    // 如果子节点全部被过滤掉，返回 null
    return Object.keys(result).length > 0 ? result : null;
  }
  const filteredTree = helper(tree);
  if (filteredTree && location && namespaceStrategy !== NAMESPACE_STRATEGY.none) {
    const parts = location.split(".").slice(namespaceStrategy === NAMESPACE_STRATEGY.full ? 0 : -1);
    return parts.reduce((acc, part) => {
      if (Object.hasOwn(acc, part)) {
        return acc[part] as EntryTree;
      }
      return {};
    }, filteredTree);
  }
  return filteredTree || {};
}

function buildSplit(parts: string[], i: number, m: number): string[] {
  const split: string[] = [];
  let current = parts[0];
  for (let j = 0; j < m - 1; j++) {
    if ((i & (1 << j)) !== 0) {
      current += "." + parts[j + 1];
    } else {
      split.push(current);
      current = parts[j + 1];
    }
  }
  split.push(current);
  return split;
}

function accessPath(obj: EntryTree | string | string[], path: string[]): string | undefined {
  let current = obj;
  for (const key of path) {
    if (Boolean(current) && typeof current === "object" && Object.hasOwn(current, key)) {
      current = current[key] as EntryTree | string[];
    } else {
      return undefined;
    }
  }
  return current as string;
}
