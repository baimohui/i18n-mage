import { EntryTree, EntryNode } from "@/types";
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

export function getFileLocationFromId(id: string, fileStructure: EntryNode): string[] | null {
  const segments = getPathSegsFromId(id);
  const pathSegs: string[] = [];
  let node: EntryNode = fileStructure;
  for (const seg of segments) {
    if (node.type === "directory" && node.children && Object.hasOwn(node.children, seg)) {
      pathSegs.push(seg);
      node = node.children[seg];
    } else {
      break;
    }
  }
  if (node.type !== "file") return null; // 路径在结构里不存在
  return pathSegs;
}

export function getContentAtLocation(location: string, tree: EntryTree): EntryTree | null {
  const segments = getPathSegsFromId(location);
  let cursor: EntryTree = tree;
  for (const seg of segments) {
    if (typeof cursor === "object" && Object.hasOwn(cursor, seg)) {
      cursor = cursor[seg] as EntryTree;
    } else {
      return null;
    }
  }
  return cursor;
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
