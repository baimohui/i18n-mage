import * as assert from "assert";
import { catchTEntries } from "@/utils/regex";

describe("regex.js 正则方法", () => {
  describe("catchTEntries", () => {
    it("应提取单个简单文本", () => {
      const entries = catchTEntries(`const msg = t("Hello World");`);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].text, "Hello World");
      assert.strictEqual(entries[0].raw.includes("t("), true);
    });

    it("应处理模板字符串带变量", () => {
      const entries = catchTEntries("const msg = t(`你好，${userName}！`);");
      assert.strictEqual(entries[0].text, "你好，{t0}！");
      assert.deepStrictEqual(entries[0].var, { t0: "userName" });
    });

    it("应处理混合变量和文本", () => {
      const entries = catchTEntries('const msg = t("你好" + name);');
      assert.strictEqual(entries[0].text.includes("{t0}"), true);
      assert.ok(Object.hasOwn(entries[0]?.var ?? {}, "t0"));
    });

    it("应处理各种带参数的函数调用", () => {
      const testCases = [
        {
          code: 'const a = t("Hello");',
          expected: { text: "Hello", var: {} }
        },
        {
          code: 'const b = t("Hello", { name: "World" });',
          expected: { text: "Hello", var: { name: "World" } }
        },
        {
          code: 'const c = t("greeting", `${userName}`);',
          expected: { text: "greeting", var: { t0: "${userName}" } }
        },
        {
          code: 'const d = t("greeting", `${userName} 欢迎你`);',
          expected: { text: "greeting", var: { t0: "${userName} 欢迎你" } }
        },
        {
          code: 'const e = t("greeting", userName);',
          expected: { text: "greeting", var: { t0: "userName" } }
        },
        {
          code: 'const f = t("#warn#%duplicate%已有翻译", keyName);',
          expected: {
            text: "已有翻译",
            var: { t0: "keyName" },
            class: "warn",
            name: "duplicate"
          }
        },
        {
          code: 'const g = t("你好", { user: "张三", count: "3" });',
          expected: { text: "你好", var: { user: "张三", count: "3" } }
        },
        {
          code: 'const invalid = translate("Oops");',
          expected: null
        }
      ];
      const code = testCases.map(tc => tc.code).join("\n");
      const entries = catchTEntries(code);
      let entryIndex = 0;
      testCases.forEach((testCase, i) => {
        const expected = testCase.expected;
        if (expected === null) {
          // 不应被识别为 t-entry
          return;
        }
        const entry = entries[entryIndex++];
        assert.notStrictEqual(entry, undefined, `第 ${i} 个 entry 应存在`);
        assert.strictEqual(entry.text, expected.text, `第 ${i} 个 text`);
        assert.deepStrictEqual(entry.var, expected.var, `第 ${i} 个 var`);
        if (expected.class !== undefined) {
          assert.strictEqual(entry.class, expected.class, `第 ${i} 个 class`);
        }
        if (expected.name !== undefined) {
          assert.strictEqual(entry.name, expected.name, `第 ${i} 个 name`);
        }
      });
    });

    it("应忽略无法解析或无 text 参数", () => {
      const entries = catchTEntries("const msg = t();");
      assert.strictEqual(entries.length, 0);
    });

    it("应解析 name 和 class 元信息", () => {
      const entries = catchTEntries('const msg = t("#btn#%submit%确认提交");');
      assert.strictEqual(entries[0].class, "btn");
      assert.strictEqual(entries[0].name, "submit");
      assert.strictEqual(entries[0].text, "确认提交");
    });

    it("应返回 null 对于无效表达式", () => {
      const entries = catchTEntries("const msg = t(unknownFunc());");
      assert.strictEqual(entries.length, 0);
    });

    it("应正确处理多行文本", () => {
      const entries = catchTEntries(`const msg = t(\`这是
多行文本\`);`);
      assert.strictEqual(entries[0].text, "这是\n多行文本");
    });

    it("应处理带引号的多行文本", () => {
      const entries = catchTEntries(`const msg = t("这是\n多行文本");`);
      assert.strictEqual(entries[0].text, "这是\n多行文本");
    });
  });
});
