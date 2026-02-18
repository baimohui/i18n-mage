/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/strict-boolean-expressions */
import * as assert from "assert";
import mockRequire from "mock-require";
import path from "path";
import { createLangContext } from "@/core/context";
import { EXECUTION_RESULT_CODE } from "@/types";
import { setWorkspaceRoot } from "../../helpers/vscodeMock";

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

describe("core/handlers/ModifyHandler", () => {
  beforeEach(() => {
    mockRequire.stop("@/translator/index");
    mockRequire.stop("@/core/handlers/RewriteHandler");
    resetHandlerModule("@/core/handlers/ModifyHandler");
  });

  it("modifyQuery 为 null 应返回 InvalidEntryName", async () => {
    const { ModifyHandler } = require("@/core/handlers/ModifyHandler");
    const ctx = createLangContext();
    ctx.modifyQuery = null;
    const res = await new ModifyHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.InvalidEntryName);
  });

  it("editValue 应生成 edit payload 并调用 RewriteHandler", async () => {
    let rewriteCalled = false;
    mockRequire("@/core/handlers/RewriteHandler", {
      RewriteHandler: class {
        constructor(_ctx: unknown) {}
        async run() {
          rewriteCalled = true;
          return { success: true, message: "", code: 200 };
        }
      }
    });
    const { ModifyHandler } = require("@/core/handlers/ModifyHandler");
    const ctx = createLangContext();
    ctx.langCountryMap = { en: { "app.title": "Old" } };
    ctx.updatePayloads = [];
    ctx.modifyQuery = {
      type: "editValue",
      data: [{ key: "app.title", value: "New", lang: "en" }]
    };
    const res = await new ModifyHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.updatePayloads[0].type, "edit");
    assert.strictEqual(ctx.updatePayloads[0].valueChanges?.en?.after, "New");
    assert.strictEqual(rewriteCalled, true);
  });

  it("editValue 多语言应生成多个 payload", async () => {
    let rewriteCalled = false;
    mockRequire("@/core/handlers/RewriteHandler", {
      RewriteHandler: class {
        constructor(_ctx: unknown) {}
        async run() {
          rewriteCalled = true;
          return { success: true, message: "", code: 200 };
        }
      }
    });
    const { ModifyHandler } = require("@/core/handlers/ModifyHandler");
    const ctx = createLangContext();
    ctx.langCountryMap = {
      en: { "app.title": "Old" },
      "zh-cn": { "app.title": "旧" }
    };
    ctx.updatePayloads = [];
    ctx.modifyQuery = {
      type: "editValue",
      data: [
        { key: "app.title", value: "New", lang: "en" },
        { key: "app.title", value: "新", lang: "zh-cn" }
      ]
    };
    const res = await new ModifyHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.updatePayloads.length, 2);
    assert.strictEqual(ctx.updatePayloads[0].valueChanges?.en?.after, "New");
    assert.strictEqual(ctx.updatePayloads[1].valueChanges?.["zh-cn"]?.after, "新");
    assert.strictEqual(rewriteCalled, true);
  });

  it("editValue 缺失语言时 before 为空字符串", async () => {
    let rewriteCalled = false;
    mockRequire("@/core/handlers/RewriteHandler", {
      RewriteHandler: class {
        constructor(_ctx: unknown) {}
        async run() {
          rewriteCalled = true;
          return { success: true, message: "", code: 200 };
        }
      }
    });
    const { ModifyHandler } = require("@/core/handlers/ModifyHandler");
    const ctx = createLangContext();
    ctx.langCountryMap = { en: { "app.title": "Old" } };
    ctx.updatePayloads = [];
    ctx.modifyQuery = {
      type: "editValue",
      data: [{ key: "app.title", value: "新", lang: "zh-cn" }]
    };
    const res = await new ModifyHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.updatePayloads.length, 1);
    assert.strictEqual(ctx.updatePayloads[0].valueChanges?.["zh-cn"]?.before, "");
    assert.strictEqual(rewriteCalled, true);
  });

  it("rewriteEntry 应翻译并生成 edit payload", async () => {
    mockRequire("@/translator/index", async () => ({
      success: true,
      data: ["你好"]
    }));
    let rewriteCalled = false;
    mockRequire("@/core/handlers/RewriteHandler", {
      RewriteHandler: class {
        constructor(_ctx: unknown) {}
        async run() {
          rewriteCalled = true;
          return { success: true, message: "", code: 200 };
        }
      }
    });
    const { ModifyHandler } = require("@/core/handlers/ModifyHandler");
    const ctx = createLangContext();
    ctx.referredLang = "en";
    ctx.langCountryMap = { en: { "app.title": "Old" }, "zh-cn": { "app.title": "旧" } };
    ctx.modifyQuery = { type: "rewriteEntry", key: "app.title", value: "Hello" };
    ctx.updatePayloads = [];
    const res = await new ModifyHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.updatePayloads.length, 1);
    assert.strictEqual(ctx.updatePayloads[0].valueChanges?.["zh-cn"]?.after, "你好");
    assert.strictEqual(rewriteCalled, true);
  });

  it("rewriteEntry 翻译部分成功应返回 TranslatorPartialFailed", async () => {
    mockRequire("@/translator/index", async (args: { target: string }) => {
      if (args.target === "zh-cn") {
        return { success: true, data: ["你好"] };
      }
      return { success: false, message: "fail" };
    });
    let rewriteCalled = false;
    mockRequire("@/core/handlers/RewriteHandler", {
      RewriteHandler: class {
        constructor(_ctx: unknown) {}
        async run() {
          rewriteCalled = true;
          return { success: true, message: "", code: 200 };
        }
      }
    });
    const { ModifyHandler } = require("@/core/handlers/ModifyHandler");
    const ctx = createLangContext();
    ctx.referredLang = "en";
    ctx.langCountryMap = { en: { "app.title": "Old" }, "zh-cn": { "app.title": "旧" }, ja: { "app.title": "古" } };
    ctx.modifyQuery = { type: "rewriteEntry", key: "app.title", value: "Hello" };
    ctx.updatePayloads = [];
    const res = await new ModifyHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.TranslatorPartialFailed);
    const changes = ctx.updatePayloads[0].valueChanges ?? {};
    assert.strictEqual(changes["zh-cn"]?.after, "你好");
    assert.strictEqual(changes["ja"], undefined);
    assert.strictEqual(rewriteCalled, true);
  });

  it("rewriteEntry 翻译全部失败应返回 TranslatorFailed", async () => {
    mockRequire("@/translator/index", async () => ({
      success: false,
      message: "fail"
    }));
    let rewriteCalled = false;
    mockRequire("@/core/handlers/RewriteHandler", {
      RewriteHandler: class {
        constructor(_ctx: unknown) {}
        async run() {
          rewriteCalled = true;
          return { success: true, message: "", code: 200 };
        }
      }
    });
    const { ModifyHandler } = require("@/core/handlers/ModifyHandler");
    const ctx = createLangContext();
    ctx.referredLang = "en";
    ctx.langCountryMap = { en: { "app.title": "Old" }, "zh-cn": { "app.title": "旧" } };
    ctx.modifyQuery = { type: "rewriteEntry", key: "app.title", value: "Hello" };
    ctx.updatePayloads = [];
    const res = await new ModifyHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.TranslatorFailed);
    const changes = ctx.updatePayloads[0].valueChanges ?? {};
    assert.strictEqual(changes["zh-cn"], undefined);
    assert.strictEqual(rewriteCalled, true);
  });

  it("renameKey 应生成 rename payload 与 patchedEntryIdInfo", async () => {
    setWorkspaceRoot(path.join(__dirname, "..", "..", "fixtures", "project-simple"));
    let rewriteCalled = false;
    mockRequire("@/core/handlers/RewriteHandler", {
      RewriteHandler: class {
        constructor(_ctx: unknown) {}
        async run() {
          rewriteCalled = true;
          return { success: true, message: "", code: 200 };
        }
      }
    });
    const { ModifyHandler } = require("@/core/handlers/ModifyHandler");
    const ctx = createLangContext();
    ctx.updatePayloads = [];
    ctx.usedEntryMap = {
      "app.title": {
        [path.join(__dirname, "..", "..", "fixtures", "project-simple", "src", "index.ts")]: new Set(["0,1,0,1"])
      }
    };
    ctx.modifyQuery = {
      type: "renameKey",
      key: "app.title",
      keyChange: {
        key: { after: "app.newTitle" },
        filePos: { after: "" },
        fullPath: { after: "app.newTitle" }
      }
    };
    const res = await new ModifyHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.updatePayloads[0].type, "rename");
    const rel = "src/index.ts";
    assert.ok(ctx.patchedEntryIdInfo[rel]);
    const fixed = ctx.patchedEntryIdInfo[rel][0];
    assert.strictEqual(fixed.fixedKey, "app.newTitle");
    assert.strictEqual(rewriteCalled, true);
  });
});
