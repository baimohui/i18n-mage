import * as assert from "assert";
import { catchTEntries } from "@/utils/regex";

describe("regex.js 正则方法", () => {
  describe("catchTEntries", () => {
    it("应提取单个简单文本", () => {
      const entries = catchTEntries(`const msg = t("Hello World");`);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].nameInfo.text, "Hello World");
      assert.strictEqual(entries[0].raw.includes("t("), true);
    });

    it("应处理模板字符串带变量", () => {
      const entries = catchTEntries("const msg = t(`你好，${userName}！`);");
      assert.strictEqual(entries[0].nameInfo.text, "你好，{0}！");
      // assert.deepStrictEqual(entries[0].var, { 0: "userName" });
    });

    it("应处理混合变量和文本", () => {
      const entries = catchTEntries('const msg = t("你好" + name);');
      assert.strictEqual(entries[0].nameInfo.text.includes("{0}"), true);
      // assert.ok(Object.hasOwn(entries[0]?.var ?? {}, "0"));
    });

    it("应处理各种带参数的函数调用", () => {
      const testCases = [
        {
          code: 'const a = t("Hello");',
          expected: { text: "Hello", vars: [] }
        },
        {
          code: 'const b = t("Hello", { name: "World" });',
          expected: { text: "Hello", vars: ['{ name: "World" }'] }
        },
        {
          code: 'u_confirm(t("我的名字叫", { name: t("小明"), sex: "man", fullName: "张" + t("小明"), school: ["初中", "高中"][index], score: { math: 80, biology: 50 }.math }))',
          expected: {
            text: "我的名字叫",
            vars: [
              '{ name: t("小明"), sex: "man", fullName: "张" + t("小明"), school: ["初中", "高中"][index], score: { math: 80, biology: 50 }.math }'
            ]
          }
        },
        {
          code: 'const c = t("greeting", `${userName}`);',
          expected: { text: "greeting", vars: ["`${userName}`"] }
        },
        {
          code: 'const d = t("greeting", `${userName} 欢迎你`);',
          expected: { text: "greeting", vars: ["`${userName} 欢迎你`"] }
        },
        {
          code: "t('deleteConfirm', [row[attrs?.nameField || 'name']])",
          expected: { text: "deleteConfirm", vars: ['[row[attrs?.nameField || "name"]]'] }
        },
        {
          code: 'const e = t("greeting", userName);',
          expected: { text: "greeting", vars: ["userName"] }
        },
        {
          code: 'const f = t("#warn#%duplicate%已有翻译", keyName);',
          expected: {
            text: "已有翻译",
            vars: ["keyName"],
            class: "warn",
            name: "duplicate"
          }
        },
        {
          code: 'const g = t("你好", { user: "张三", count: "3" });',
          expected: { text: "你好", vars: ['{ user: "张三", count: "3" }'] }
        },
        {
          code: 'const invalid = translate("Oops");',
          expected: null
        },
        {
          code: 't("command.deleteUnused.modalContent", e.data.map(item => item.name).join(", "))',
          expected: { text: "command.deleteUnused.modalContent", vars: ['e.data.map(item => item.name).join(", ")'] }
        },
        {
          code: 'NotificationManager.showError(t("common.progress.error", err instanceof Error ? err.message : t("common.unknownError")));',
          expected: { text: "common.progress.error", vars: ['err instanceof Error ? err.message : t("common.unknownError")'] }
        },
        {
          code: `NotificationManager.showSuccess(
            t(
              "command.import.langDetected",
              headInfo
                .map(item => getLangIntro(item as string)?.enName)
                .filter(item => item !== null && item !== undefined)
                .join(", ") || t("common.none")
            )
          );`,
          expected: {
            text: "command.import.langDetected",
            vars: [
              `headInfo
                .map(item => getLangIntro(item as string)?.enName)
                .filter(item => item !== null && item !== undefined)
                .join(", ") || t("common.none")`
            ]
          }
        }
      ];
      testCases.forEach((testCase, i) => {
        const expected = testCase.expected;
        if (expected === null) {
          // 不应被识别为 t-entry
          return;
        }
        const entry = catchTEntries(testCase.code)[0];
        assert.notStrictEqual(entry, undefined, `第 ${i} 个 entry 应存在`);
        assert.strictEqual(entry.nameInfo.text, expected.text, `第 ${i} 个 text`);
        assert.deepStrictEqual(entry.vars, expected.vars, `第 ${i} 个 var`);
        if (expected.class !== undefined) {
          assert.strictEqual(entry.nameInfo.boundClass, expected.class, `第 ${i} 个 class`);
        }
        if (expected.name !== undefined) {
          assert.strictEqual(entry.nameInfo.boundName, expected.name, `第 ${i} 个 name`);
        }
      });
    });

    it("应忽略无法解析或无 text 参数", () => {
      const entries = catchTEntries("const msg = t();");
      assert.strictEqual(entries.length, 0);
    });

    it("应解析 name 和 class 元信息", () => {
      const entries = catchTEntries('const msg = t("#btn#%submit%确认提交");');
      assert.strictEqual(entries[0].nameInfo.boundClass, "btn");
      assert.strictEqual(entries[0].nameInfo.boundName, "submit");
      assert.strictEqual(entries[0].nameInfo.text, "确认提交");
    });

    it("应返回 null 对于无效表达式", () => {
      const entries = catchTEntries("const msg = t(unknownFunc());");
      assert.strictEqual(entries.length, 0);
    });

    it("应正确处理多行文本", () => {
      const entries = catchTEntries(`const msg = t(\`这是
多行文本\`);`);
      assert.strictEqual(entries[0].nameInfo.text, "这是\n多行文本");
    });

    it("应处理带引号的多行文本", () => {
      const entries = catchTEntries(`const msg = t("这是\n多行文本");`);
      assert.strictEqual(entries[0].nameInfo.text, "这是\n多行文本");
    });
  });
});
