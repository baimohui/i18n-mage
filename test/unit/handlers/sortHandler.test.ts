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
    resetHandlerModule("@/core/handlers/SortHandler");
  });

  it("getSortedKeys 应按 key 排序", () => {
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

  it("getSortedKeys 应按 position 顺序", () => {
    const { SortHandler } = require("@/core/handlers/SortHandler");
    const ctx = createLangContext();
    ctx.usedKeySet = new Set(["b.key"]);
    ctx.unusedKeySet = new Set(["a.key"]);
    const handler = new SortHandler(ctx);
    const keys = handler.getSortedKeys(SORT_MODE.ByPosition);
    assert.deepStrictEqual(keys, ["b.key", "a.key"]);
  });

  it("run 在满足条件时应调用 RewriteHandler", async () => {
    let called = false;
    mockRequire("@/core/handlers/RewriteHandler", {
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
});
