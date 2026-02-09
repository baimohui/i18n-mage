import * as assert from "assert";
import {
  genLangTree,
  getCommonFilePaths,
  getContentAtLocation,
  getEntryFromLangTree,
  getFileLocationFromId,
  getLangTree,
  getParentKeys,
  getValueByAmbiguousEntryName,
  setValueByEscapedEntryName,
  traverseLangTree
} from "@/utils/regex/treeUtils";
import { NAMESPACE_STRATEGY } from "@/types";

describe("utils/regex/treeUtils", () => {
  it("genLangTree 应生成去空格的树", () => {
    const tree = {};
    genLangTree(tree, { a: { b: "x y" } });
    assert.deepStrictEqual(tree, { a: { b: "xy" } });
  });

  it("traverseLangTree 应遍历叶子节点", () => {
    const tree = { a: { b: "x" }, c: "y" };
    const entries: Array<[string, string]> = [];
    traverseLangTree(tree, (key, value) => entries.push([key, String(value)]));
    assert.deepStrictEqual(entries.sort(), [
      ["ab", "x"],
      ["c", "y"]
    ]);
  });

  it("getLangTree/getEntryFromLangTree 应解析路径", () => {
    const tree = { a: { b: "x" } };
    assert.strictEqual(getLangTree(tree), "object");
    assert.deepStrictEqual(getEntryFromLangTree(tree, "a.b"), { b: "x" });
  });

  it("setValueByEscapedEntryName 应支持转义路径", () => {
    const tree = {};
    setValueByEscapedEntryName(tree, "a\\.b.c", "x");
    assert.deepStrictEqual(tree, { "a.b": { c: "x" } });
  });

  it("getValueByAmbiguousEntryName 应尝试不同切分", () => {
    const tree = { "a.b": "x", a: { c: "y" } };
    assert.strictEqual(getValueByAmbiguousEntryName(tree, "a.b"), "x");
  });

  it("getCommonFilePaths 应返回所有文件路径", () => {
    const fileStructure = {
      type: "directory" as const,
      children: {
        en: { type: "directory" as const, children: { common: { type: "file" as const, ext: "json" } } },
        zh: { type: "directory" as const, children: { common: { type: "file" as const, ext: "json" } } }
      }
    };
    assert.deepStrictEqual(getCommonFilePaths(fileStructure).sort(), ["en/common", "zh/common"]);
  });

  it("getParentKeys 应返回父节点路径", () => {
    const tree = { a: { b: { c: "x" } } };
    assert.deepStrictEqual(getParentKeys(tree), ["a", "a.b"]);
  });

  it("getFileLocationFromId 应解析路径并返回文件位置", () => {
    const fileStructure = {
      type: "directory" as const,
      children: {
        app: { type: "directory" as const, children: { common: { type: "file" as const, ext: "json" } } }
      }
    };
    assert.deepStrictEqual(getFileLocationFromId("app.common", fileStructure), ["app", "common"]);
    assert.strictEqual(getFileLocationFromId("app.missing", fileStructure), null);
  });

  it("getContentAtLocation 应按 location 过滤", () => {
    const tree = { app: { title: "id1", menu: { file: "id2" } } };
    const dictionary = {
      id1: { fullPath: "id1", fileScope: "common", value: { en: "Hello" } },
      id2: { fullPath: "id2", fileScope: "other", value: { en: "Hello" } }
    };
    const res = getContentAtLocation("common", tree, dictionary, NAMESPACE_STRATEGY.none);
    assert.deepStrictEqual(res, { app: { title: "id1" } });
  });
});
