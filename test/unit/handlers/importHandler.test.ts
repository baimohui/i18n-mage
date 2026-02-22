/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
import * as assert from "assert";
import mockRequire from "mock-require";
import { createLangContext } from "@/core/context";
import { EXECUTION_RESULT_CODE } from "@/types";

const parseMock = (data: any[]) => ({
  parse: (_path: string) => data
});

function resetHandlerModule(modulePath: string) {
  try {
    const resolved = require.resolve(modulePath);
    if (require.cache[resolved]) {
      delete require.cache[resolved];
    }
  } catch {
    // ignore
  }
}

describe("core/handlers/ImportHandler", () => {
  beforeEach(() => {
    mockRequire.stop("fs");
    mockRequire.stop("@/utils/lazyDeps");
    resetHandlerModule("@/core/handlers/ImportHandler");
  });

  it("路径不存在应返回 InvalidExportPath", async () => {
    mockRequire("fs", { existsSync: () => false });
    mockRequire("@/utils/lazyDeps", { loadNodeXlsx: () => parseMock([]) });
    const { ImportHandler } = require("@/core/handlers/ImportHandler");

    const ctx = createLangContext();
    ctx.importExcelFrom = "missing.xlsx";
    const res = await new ImportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.InvalidExportPath);
  });

  it("缺少语言列应返回 ImportNoLang", async () => {
    mockRequire("fs", { existsSync: () => true });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () =>
        parseMock([
          {
            name: "Sheet1",
            data: [
              ["Key", "Value"],
              ["a", "b"]
            ]
          }
        ])
    });
    const { ImportHandler } = require("@/core/handlers/ImportHandler");

    const ctx = createLangContext();
    ctx.importExcelFrom = "mock.xlsx";
    const res = await new ImportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.ImportNoLang);
  });

  it("key 模式应生成 edit payload", async () => {
    mockRequire("fs", { existsSync: () => true });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () =>
        parseMock([
          {
            name: "Sheet1",
            data: [
              ["Key", "English", "简体中文"],
              ["app.title", "Hello", "你好"]
            ]
          }
        ])
    });
    const { ImportHandler } = require("@/core/handlers/ImportHandler");

    const ctx = createLangContext();
    ctx.importExcelFrom = "mock.xlsx";
    ctx.importMode = "key";
    ctx.langDictionary = {
      "app.title": { fullPath: "app.title", fileScope: "", value: { en: "Hello", "zh-cn": "Hello" } }
    };
    ctx.langCountryMap = { en: { "app.title": "Hello" }, "zh-cn": { "app.title": "Hello" } };
    ctx.updatePayloads = [];
    const res = await new ImportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.updatePayloads.length, 1);
    assert.strictEqual(ctx.updatePayloads[0].key, "app.title");
    assert.strictEqual(ctx.updatePayloads[0].valueChanges?.["zh-cn"]?.after, "你好");
  });

  it("language 模式应按基准语言匹配", async () => {
    mockRequire("fs", { existsSync: () => true });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () =>
        parseMock([
          {
            name: "Sheet1",
            data: [
              ["Key", "English", "简体中文"],
              ["", "Hello", "你好"]
            ]
          }
        ])
    });
    const { ImportHandler } = require("@/core/handlers/ImportHandler");

    const ctx = createLangContext();
    ctx.importExcelFrom = "mock.xlsx";
    ctx.importMode = "language";
    ctx.baselineLanguage = "en";
    ctx.langDictionary = {
      "app.title": { fullPath: "app.title", fileScope: "", value: { en: "Hello", "zh-cn": "Hello" } }
    };
    ctx.langCountryMap = { en: { "app.title": "Hello" }, "zh-cn": { "app.title": "Hello" } };
    ctx.updatePayloads = [];
    const res = await new ImportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.updatePayloads.length, 1);
    assert.strictEqual(ctx.updatePayloads[0].valueChanges?.["zh-cn"]?.after, "你好");
  });

  it("多 sheet 应依次处理并累计 payload", async () => {
    mockRequire("fs", { existsSync: () => true });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () =>
        parseMock([
          {
            name: "Sheet1",
            data: [
              ["Key", "English", "简体中文"],
              ["app.title", "Hello", "你好"]
            ]
          },
          {
            name: "Sheet2",
            data: [
              ["Key", "English", "简体中文"],
              ["app.menu.file", "File", "文件"]
            ]
          }
        ])
    });
    const { ImportHandler } = require("@/core/handlers/ImportHandler");

    const ctx = createLangContext();
    ctx.importExcelFrom = "mock.xlsx";
    ctx.importMode = "key";
    ctx.langDictionary = {
      "app.title": { fullPath: "app.title", fileScope: "", value: { en: "Hello", "zh-cn": "Hello" } },
      "app.menu.file": { fullPath: "app.menu.file", fileScope: "", value: { en: "File", "zh-cn": "File" } }
    };
    ctx.langCountryMap = {
      en: { "app.title": "Hello", "app.menu.file": "File" },
      "zh-cn": { "app.title": "Hello", "app.menu.file": "File" }
    };
    ctx.updatePayloads = [];
    const res = await new ImportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.updatePayloads.length, 2);
  });

  it("header 无 key 列应返回 ImportNoKey", async () => {
    mockRequire("fs", { existsSync: () => true });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () =>
        parseMock([
          {
            name: "Sheet1",
            data: [
              ["English", "简体中文"],
              ["Hello", "你好"]
            ]
          }
        ])
    });
    const { ImportHandler } = require("@/core/handlers/ImportHandler");

    const ctx = createLangContext();
    ctx.importExcelFrom = "mock.xlsx";
    const res = await new ImportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.ImportNoKey);
  });

  it("header 含空列应忽略并继续解析", async () => {
    mockRequire("fs", { existsSync: () => true });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () =>
        parseMock([
          {
            name: "Sheet1",
            data: [
              ["Key", "", "English", "简体中文"],
              ["app.title", "", "Hello", "你好"]
            ]
          }
        ])
    });
    const { ImportHandler } = require("@/core/handlers/ImportHandler");

    const ctx = createLangContext();
    ctx.importExcelFrom = "mock.xlsx";
    ctx.importMode = "key";
    ctx.langDictionary = {
      "app.title": { fullPath: "app.title", fileScope: "", value: { en: "Hello", "zh-cn": "Hello" } }
    };
    ctx.langCountryMap = { en: { "app.title": "Hello" }, "zh-cn": { "app.title": "Hello" } };
    ctx.updatePayloads = [];
    const res = await new ImportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.updatePayloads.length, 1);
    assert.strictEqual(ctx.updatePayloads[0].valueChanges?.["zh-cn"]?.after, "你好");
  });

  it("header 混合大小写应识别 Key 与语言列", async () => {
    mockRequire("fs", { existsSync: () => true });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () =>
        parseMock([
          {
            name: "Sheet1",
            data: [
              ["kEy", "ENGLISH", "zh-CN"],
              ["app.title", "Hello", "你好"]
            ]
          }
        ])
    });
    const { ImportHandler } = require("@/core/handlers/ImportHandler");

    const ctx = createLangContext();
    ctx.importExcelFrom = "mock.xlsx";
    ctx.importMode = "key";
    ctx.langDictionary = {
      "app.title": { fullPath: "app.title", fileScope: "", value: { en: "Hello", "zh-cn": "Hello" } }
    };
    ctx.langCountryMap = { en: { "app.title": "Hello" }, "zh-cn": { "app.title": "Hello" } };
    ctx.updatePayloads = [];
    const res = await new ImportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.updatePayloads.length, 1);
    assert.strictEqual(ctx.updatePayloads[0].valueChanges?.["zh-cn"]?.after, "你好");
  });
});
