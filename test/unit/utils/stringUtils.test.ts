import * as assert from "assert";
import {
  escapeRegExp,
  escapeString,
  genIdFromText,
  genKeyFromText,
  generateKey,
  getPathSegsFromId,
  parseEscapedPath,
  splitFileName,
  unescapeString
} from "@/utils/regex/stringUtils";
import { KEY_STYLE } from "@/types";

describe("utils/regex/stringUtils", () => {
  it("escapeRegExp 应转义正则特殊字符", () => {
    assert.strictEqual(escapeRegExp("a.b*c?"), "a\\.b\\*c\\?");
  });

  it("generateKey 应支持不同 keyStyle", () => {
    const parts = ["hello", "world"];
    assert.strictEqual(generateKey(parts, KEY_STYLE.camelCase), "helloWorld");
    assert.strictEqual(generateKey(parts, KEY_STYLE.pascalCase), "HelloWorld");
    assert.strictEqual(generateKey(parts, KEY_STYLE.snakeCase), "hello_world");
    assert.strictEqual(generateKey(parts, KEY_STYLE.kebabCase), "hello-world");
    assert.strictEqual(generateKey(parts, KEY_STYLE.raw), "helloworld");
  });

  it("splitFileName 应处理下划线、横杠与驼峰", () => {
    assert.deepStrictEqual(splitFileName("HelloWorld_file-name"), ["hello", "world", "file", "name"]);
  });

  it("genKeyFromText 应生成并过滤 stopWords", () => {
    const key = genKeyFromText("Hello the World!", { keyStyle: KEY_STYLE.camelCase, stopWords: ["the"] });
    assert.strictEqual(key, "helloWorld");
  });

  it("genIdFromText 应移除空格与反斜杠", () => {
    assert.strictEqual(genIdFromText("A B\\C"), "abc");
  });

  it("escapeString/unescapeString 应互为逆操作", () => {
    const raw = "a.b\\c";
    const escaped = escapeString(raw);
    assert.strictEqual(escaped, "a\\.b\\\\c");
    assert.strictEqual(unescapeString(escaped), raw);
  });

  it("parseEscapedPath 应支持转义点号", () => {
    assert.deepStrictEqual(parseEscapedPath("a\\.b.c"), ["a.b", "c"]);
  });

  it("parseEscapedPath 应拒绝无效转义", () => {
    assert.throws(() => parseEscapedPath("a\\"));
  });

  it("getPathSegsFromId 应按转义点分割", () => {
    assert.deepStrictEqual(getPathSegsFromId("a\\.b.c"), ["a.b", "c"]);
  });
});
