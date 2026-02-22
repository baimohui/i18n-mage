/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
import * as assert from "assert";
import mockRequire from "mock-require";
import { createLangContext } from "@/core/context";
import { EXECUTION_RESULT_CODE } from "@/types";

const buildMock = () => ({
  build: (_sheets: unknown, _opts: unknown) => Buffer.from("xlsx")
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

describe("core/handlers/ExportHandler", () => {
  beforeEach(() => {
    mockRequire.stop("fs");
    mockRequire.stop("@/utils/lazyDeps");
    resetHandlerModule("@/core/handlers/ExportHandler");
  });

  it("exportExcelTo 为空应返回 InvalidExportPath", async () => {
    mockRequire("fs", { writeFileSync: () => undefined });
    mockRequire("@/utils/lazyDeps", { loadNodeXlsx: () => buildMock() });
    const { ExportHandler } = require("@/core/handlers/ExportHandler");

    const ctx = createLangContext();
    ctx.exportExcelTo = "";
    const res = await new ExportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.InvalidExportPath);
  });

  it("应写出包含表头与词条的数据", async () => {
    const writes: Buffer[] = [];
    let capturedSheets: any[] = [];
    mockRequire("fs", { writeFileSync: (_p: string, buf: Buffer) => writes.push(buf) });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () => ({
        build: (sheets: any[]) => {
          capturedSheets = sheets;
          return Buffer.from("xlsx");
        }
      })
    });
    const { ExportHandler } = require("@/core/handlers/ExportHandler");

    const ctx = createLangContext();
    ctx.exportExcelTo = "out.xlsx";
    ctx.langDictionary = {
      "app.title": { fullPath: "app.title", fileScope: "", value: { en: "Hello", "zh-cn": "你好" } }
    };
    ctx.langCountryMap = {
      en: { "app.title": "Hello" },
      "zh-cn": { "app.title": "你好" }
    };
    ctx.sortingExportMode = "none";
    const res = await new ExportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(writes.length, 1);
    assert.ok(writes[0].length > 0);
    assert.strictEqual(capturedSheets[0].data[0][0], "Key");
  });

  it("sortingExportMode=byKey 应按 key 排序", async () => {
    let capturedSheets: any[] = [];
    mockRequire("fs", { writeFileSync: (_p: string, buf: Buffer) => void buf });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () => ({
        build: (sheets: any[]) => {
          capturedSheets = sheets;
          return Buffer.from("xlsx");
        }
      })
    });
    const { ExportHandler } = require("@/core/handlers/ExportHandler");

    const ctx = createLangContext();
    ctx.exportExcelTo = "out.xlsx";
    ctx.langDictionary = {
      "b.key": { fullPath: "b.key", fileScope: "", value: { en: "B" } },
      "a.key": { fullPath: "a.key", fileScope: "", value: { en: "A" } }
    };
    ctx.langCountryMap = { en: { "a.key": "A", "b.key": "B" } };
    ctx.sortingExportMode = "byKey";
    const res = await new ExportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(capturedSheets[0].data[1][0], "a.key");
    assert.strictEqual(capturedSheets[0].data[2][0], "b.key");
  });

  it("sortingExportMode=byPosition 应按使用顺序排序", async () => {
    let capturedSheets: any[] = [];
    mockRequire("fs", { writeFileSync: (_p: string, buf: Buffer) => void buf });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () => ({
        build: (sheets: any[]) => {
          capturedSheets = sheets;
          return Buffer.from("xlsx");
        }
      })
    });
    const { ExportHandler } = require("@/core/handlers/ExportHandler");

    const ctx = createLangContext();
    ctx.exportExcelTo = "out.xlsx";
    ctx.langDictionary = {
      "a.key": { fullPath: "a.key", fileScope: "", value: { en: "A" } },
      "b.key": { fullPath: "b.key", fileScope: "", value: { en: "B" } }
    };
    ctx.langCountryMap = { en: { "a.key": "A", "b.key": "B" } };
    ctx.usedKeySet = new Set(["b.key"]);
    ctx.unusedKeySet = new Set(["a.key"]);
    ctx.sortingExportMode = "byPosition";
    const res = await new ExportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(capturedSheets[0].data[1][0], "b.key");
    assert.strictEqual(capturedSheets[0].data[2][0], "a.key");
  });

  it("空字典仍应生成表头", async () => {
    let capturedSheets: any[] = [];
    mockRequire("fs", { writeFileSync: (_p: string, buf: Buffer) => void buf });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () => ({
        build: (sheets: any[]) => {
          capturedSheets = sheets;
          return Buffer.from("xlsx");
        }
      })
    });
    const { ExportHandler } = require("@/core/handlers/ExportHandler");

    const ctx = createLangContext();
    ctx.exportExcelTo = "out.xlsx";
    ctx.langDictionary = {};
    ctx.langCountryMap = { en: {} };
    ctx.sortingExportMode = "none";
    const res = await new ExportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(capturedSheets[0].data.length, 1);
    assert.strictEqual(capturedSheets[0].data[0][0], "Key");
  });

  it("排序为空集合时不应报错", async () => {
    let capturedSheets: any[] = [];
    mockRequire("fs", { writeFileSync: (_p: string, buf: Buffer) => void buf });
    mockRequire("@/utils/lazyDeps", {
      loadNodeXlsx: () => ({
        build: (sheets: any[]) => {
          capturedSheets = sheets;
          return Buffer.from("xlsx");
        }
      })
    });
    const { ExportHandler } = require("@/core/handlers/ExportHandler");

    const ctx = createLangContext();
    ctx.exportExcelTo = "out.xlsx";
    ctx.langDictionary = {};
    ctx.langCountryMap = { en: {} };
    ctx.sortingExportMode = "byKey";
    const res = await new ExportHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(capturedSheets[0].data.length, 1);
  });
});
