import * as assert from "assert";
import {
  convertKeyToVueI18nPath,
  displayToInternalName,
  extractKeyValuePairs,
  internalToDisplayName,
  isPositionInComment,
  matchBrackets
} from "@/utils/regex/entryUtils";
import { setCacheConfig, clearConfigCache } from "@/utils/config";
import { I18N_FRAMEWORK } from "@/types";

describe("utils/regex/entryUtils", () => {
  beforeEach(() => {
    clearConfigCache("i18nFeatures");
    clearConfigCache("analysis");
  });

  it("isPositionInComment 应识别注释与禁用区块", () => {
    setCacheConfig("analysis.ignoreCommentedCode", true);
    const code = `// comment\nconst a = 1;\n/* block */\nconst b = 2;`;
    assert.strictEqual(isPositionInComment(code, 2), true);
    assert.strictEqual(isPositionInComment(code, code.indexOf("block")), true);

    setCacheConfig("analysis.ignoreCommentedCode", false);
    const custom = `i18n-mage-disable\nconst x = 1;\ni18n-mage-enable`;
    assert.strictEqual(isPositionInComment(custom, custom.indexOf("const x")), true);
  });

  it("displayToInternalName 应根据框架与命名空间处理", () => {
    setCacheConfig("i18nFeatures.framework", I18N_FRAMEWORK.i18nNext);
    setCacheConfig("i18nFeatures.defaultNamespace", "ns");
    setCacheConfig("i18nFeatures.namespaceSeparator", ".");
    assert.strictEqual(displayToInternalName("hello"), "ns.hello");

    setCacheConfig("i18nFeatures.framework", I18N_FRAMEWORK.vueI18n);
    assert.strictEqual(displayToInternalName("a['b'].c[0]"), "a.b.c.0");
  });

  it("internalToDisplayName 应按 i18next 规则还原展示名称", () => {
    setCacheConfig("i18nFeatures.framework", I18N_FRAMEWORK.i18nNext);
    setCacheConfig("i18nFeatures.defaultNamespace", "ns");
    setCacheConfig("i18nFeatures.namespaceSeparator", "auto");
    assert.strictEqual(internalToDisplayName("ns.hello"), "hello");
  });

  it("extractKeyValuePairs 应解析对象字面量", () => {
    const res = extractKeyValuePairs(`{ a: 1, b: "x", c: { k: 2 }, d: [1,2] }`);
    assert.deepStrictEqual(res, {
      a: "1",
      b: '"x"',
      c: "{ k: 2 }",
      d: "[1,2]"
    });
    assert.strictEqual(extractKeyValuePairs("notAnObject"), null);
  });

  it("matchBrackets 应支持嵌套", () => {
    const res = matchBrackets("a{b{c}d}e", 1, "{", "}");
    assert.deepStrictEqual(res, [7, "{b{c}d}"]);
  });

  it("convertKeyToVueI18nPath 应正确处理转义点号与数字段", () => {
    const res = convertKeyToVueI18nPath("a.b\\.c.0", "'");
    assert.strictEqual(res, "a['b.c'][0]");
  });
});
