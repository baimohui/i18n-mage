/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import * as assert from "assert";
import mockRequire from "mock-require";
import { createLangContext } from "@/core/context";
import { SORT_MODE } from "@/types";

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

describe("core/handlers/SortHandler", () => {
  beforeEach(() => {
    mockRequire.stop("@/core/handlers/RewriteHandler");
    resetHandlerModule("@/core/handlers/RewriteHandler");
    resetHandlerModule("@/core/handlers/SortHandler");
  });

  it("getSortedKeys should sort by key", () => {
    const { SortHandler } = require("@/core/handlers/SortHandler");
    const ctx = createLangContext();
    ctx.langDictionary = {
      "b.key": { fullPath: "b.key", fileScope: "", value: { en: "B" } },
      "a.key": { fullPath: "a.key", fileScope: "", value: { en: "A" } }
    };
    const handler = new SortHandler(ctx);
    const keys = handler.getSortedKeys(SORT_MODE.ByKey);
    assert.deepStrictEqual(keys, ["a.key", "b.key"]);
  });

  it("getSortedKeys should sort by position", () => {
    const { SortHandler } = require("@/core/handlers/SortHandler");
    const ctx = createLangContext();
    ctx.usedKeySet = new Set(["b.key"]);
    ctx.unusedKeySet = new Set(["a.key"]);
    const handler = new SortHandler(ctx);
    const keys = handler.getSortedKeys(SORT_MODE.ByPosition);
    assert.deepStrictEqual(keys, ["b.key", "a.key"]);
  });

  it("run should call RewriteHandler for flat byKey", async () => {
    let called = false;
    const rewriteHandlerPath = require.resolve("@/core/handlers/RewriteHandler");
    mockRequire(rewriteHandlerPath, {
      RewriteHandler: class {
        constructor(_ctx: unknown) {}
        async run(_silent: boolean) {
          called = true;
          return { success: true, message: "", code: 200 };
        }
      }
    });
    const { SortHandler } = require("@/core/handlers/SortHandler");
    const ctx = createLangContext();
    ctx.sortingWriteMode = SORT_MODE.ByKey;
    ctx.avgFileNestedLevel = 0;
    ctx.languageStructure = "flat";
    ctx.langCountryMap = { en: { "b.key": "B", "a.key": "A" } };
    const handler = new SortHandler(ctx);
    await handler.run();
    assert.strictEqual(called, true);
  });

  it("run should support nested byKey sorting", async () => {
    let called = false;
    const rewriteHandlerPath = require.resolve("@/core/handlers/RewriteHandler");
    mockRequire(rewriteHandlerPath, {
      RewriteHandler: class {
        constructor(_ctx: unknown) {}
        async run(_silent: boolean) {
          called = true;
          return { success: true, message: "", code: 200 };
        }
      }
    });
    const { SortHandler } = require("@/core/handlers/SortHandler");
    const ctx = createLangContext();
    ctx.sortingWriteMode = SORT_MODE.ByKey;
    ctx.avgFileNestedLevel = 1;
    ctx.languageStructure = "nested";
    ctx.langCountryMap = { en: { "z.key": "Z", "a.key": "A" } };
    ctx.entryTree = {
      z: { c: "z.c", a: "z.a" },
      a: { b: "a.b" }
    };
    const handler = new SortHandler(ctx);
    await handler.run();
    assert.strictEqual(called, true);
    assert.deepStrictEqual(Object.keys(ctx.entryTree), ["a", "z"]);
    assert.deepStrictEqual(Object.keys(ctx.entryTree.z as Record<string, string>), ["a", "c"]);
  });
});
