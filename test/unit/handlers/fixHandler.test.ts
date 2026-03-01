/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, prettier/prettier */
import * as assert from "assert";
import path from "path";
import mockRequire from "mock-require";
import { createLangContext } from "@/core/context";
import { EXECUTION_RESULT_CODE, I18N_FRAMEWORK, KEY_GENERATION_FILL_SCOPE, KEY_STRATEGY, NAMESPACE_STRATEGY } from "@/types";
import { genIdFromText } from "@/utils/regex";
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

describe("core/handlers/FixHandler", () => {
  beforeEach(() => {
    mockRequire.stop("@/translator/index");
    mockRequire.stop("@/ai");
    mockRequire.stop("tiny-pinyin");
    resetHandlerModule("@/core/handlers/FixHandler");

    mockRequire("@/translator/index", async (_args: unknown) => ({
      success: true,
      data: []
    }));
    mockRequire("@/ai", {
      generateKeyFromAi: async (_args: unknown) => ({
        success: true,
        data: []
      })
    });
    mockRequire("tiny-pinyin", {
      convertToPinyin: (s: string) => s
    });
  });

  it("无 referredLang 应返回 NoReferredLang", async () => {
    const { FixHandler } = require("@/core/handlers/FixHandler");
    const ctx = createLangContext();
    ctx.referredLang = "";
    const handler = new FixHandler(ctx);
    const res = await handler.run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.NoReferredLang);
  });

  it("processUndefinedEntries 应应用 keyPatch 并生成更新 payload", async () => {
    const { FixHandler } = require("@/core/handlers/FixHandler");
    const ctx = createLangContext();
    ctx.referredLang = "en";
    ctx.langCountryMap = { en: {} };
    ctx.langDictionary = {};
    ctx.entryTree = {};
    ctx.i18nFramework = I18N_FRAMEWORK.none;
    ctx.namespaceStrategy = NAMESPACE_STRATEGY.none;
    ctx.fixQuery.entriesToGen = true;
    ctx.fixQuery.entriesToFill = false;
    ctx.keyStrategy = KEY_STRATEGY.english;
    ctx.keyGenerationFillScope = KEY_GENERATION_FILL_SCOPE.all;
    ctx.nameSeparator = ".";
    ctx.missingEntryFile = "";
    ctx.missingEntryPath = "";
    ctx.updatePayloads = [];
    ctx.patchedEntryIdInfo = {};
    const entryId = genIdFromText("Hello");
    ctx.fixQuery.keyPatch = {
      [entryId]: "app.title"
    };
    const filePath = path.join(__dirname, "..", "..", "fixtures", "project-simple", "src", "index.ts");
    ctx.undefinedEntryList = [
      {
        raw: 't("Hello")',
        vars: [],
        pos: "0,5,0,5",
        path: filePath,
        nameInfo: {
          text: "Hello",
          regex: /^Hello$/,
          name: "Hello",
          boundPrefix: "",
          boundKey: "",
          vars: []
        }
      }
    ];
    const handler = new FixHandler(ctx);
    const res = await handler.run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.langDictionary["app.title"].value.en, "Hello");
    assert.strictEqual(ctx.updatePayloads.length, 1);
    assert.strictEqual(ctx.updatePayloads[0].type, "add");
    assert.strictEqual(ctx.updatePayloads[0].key, "app.title");
  });

  it("fillMissingTranslations fillWithOriginal 应直接填充", async () => {
    const { FixHandler } = require("@/core/handlers/FixHandler");
    const ctx = createLangContext();
    ctx.referredLang = "en";
    ctx.langCountryMap = { en: { "app.title": "Hello" }, zh: {} };
    ctx.langDictionary = {
      "app.title": { fullPath: "app.title", fileScope: "", value: { en: "Hello" } }
    };
    ctx.lackInfo = { zh: ["app.title"] };
    ctx.nullInfo = {};
    ctx.updatePayloads = [];
    ctx.fixQuery.entriesToFill = true;
    ctx.fixQuery.fillWithOriginal = true;
    const handler = new FixHandler(ctx);
    const res = await handler.run();
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.Success);
    assert.strictEqual(ctx.updatePayloads.length, 1);
    assert.deepStrictEqual(ctx.updatePayloads[0].valueChanges?.zh?.after, "Hello");
  });

  it("翻译失败应返回 TranslatorFailed", async () => {
    mockRequire("@/translator/index", async () => ({
      success: false,
      message: "fail"
    }));
    resetHandlerModule("@/core/handlers/FixHandler");
    const { FixHandler } = require("@/core/handlers/FixHandler");
    const ctx = createLangContext();
    ctx.referredLang = "en";
    ctx.langCountryMap = { en: { "app.title": "Hello" }, "zh-cn": {} };
    ctx.langDictionary = {
      "app.title": { fullPath: "app.title", fileScope: "", value: { en: "Hello" } }
    };
    ctx.lackInfo = { "zh-cn": ["app.title"] };
    ctx.nullInfo = {};
    ctx.updatePayloads = [];
    ctx.fixQuery.entriesToFill = true;
    const res = await new FixHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.TranslatorFailed);
  });

  it("翻译部分成功应返回 TranslatorPartialFailed", async () => {
    mockRequire("@/translator/index", async (args: { target: string }) => {
      if (args.target === "zh-cn") {
        return { success: true, data: ["你好"] };
      }
      return { success: false, message: "fail" };
    });
    resetHandlerModule("@/core/handlers/FixHandler");
    const { FixHandler } = require("@/core/handlers/FixHandler");
    const ctx = createLangContext();
    ctx.referredLang = "en";
    ctx.langCountryMap = { en: { "app.title": "Hello" }, "zh-cn": {}, ja: {} };
    ctx.langDictionary = {
      "app.title": { fullPath: "app.title", fileScope: "", value: { en: "Hello" } }
    };
    ctx.lackInfo = { "zh-cn": ["app.title"], ja: ["app.title"] };
    ctx.nullInfo = {};
    ctx.updatePayloads = [];
    ctx.fixQuery.entriesToFill = true;
    const res = await new FixHandler(ctx).run();
    assert.strictEqual(res.code, EXECUTION_RESULT_CODE.TranslatorPartialFailed);
    assert.strictEqual(
      ctx.updatePayloads.some(p => p.valueChanges?.["zh-cn"]?.after === "你好"),
      true
    );
    assert.strictEqual(
      ctx.updatePayloads.some(p => p.valueChanges?.["ja"]),
      false
    );
  });

  it("auto-path 应根据相对路径生成前缀", async () => {
    const { FixHandler } = require("@/core/handlers/FixHandler");
    const workspaceRoot = path.join(__dirname, "..", "..", "fixtures", "project-simple");
    setWorkspaceRoot(workspaceRoot);
    const filePath = path.join(workspaceRoot, "src", "index.ts");

    const ctx = createLangContext();
    ctx.referredLang = "en";
    ctx.langCountryMap = { en: {} };
    ctx.langDictionary = {};
    ctx.entryTree = {};
    ctx.i18nFramework = I18N_FRAMEWORK.none;
    ctx.namespaceStrategy = NAMESPACE_STRATEGY.none;
    ctx.fixQuery.entriesToGen = true;
    ctx.fixQuery.entriesToFill = false;
    ctx.keyStrategy = KEY_STRATEGY.english;
    ctx.keyPrefix = "auto-path";
    ctx.nameSeparator = ".";
    ctx.stopPrefixes = [];
    ctx.updatePayloads = [];
    ctx.patchedEntryIdInfo = {};
    ctx.undefinedEntryList = [
      {
        raw: 't("Hello")',
        vars: [],
        pos: "0,5,0,5",
        path: filePath,
        nameInfo: {
          text: "Hello",
          regex: /^Hello$/,
          name: "Hello",
          boundPrefix: "",
          boundKey: "",
          vars: []
        }
      }
    ];
    const handler = new FixHandler(ctx);
    await handler.run();
    assert.ok(ctx.updatePayloads.some(p => p.key === "src.index.hello"));
  });

  it("auto-popular 应使用热门类前缀", async () => {
    const { FixHandler } = require("@/core/handlers/FixHandler");
    const ctx = createLangContext();
    ctx.referredLang = "en";
    ctx.langCountryMap = { en: {} };
    ctx.langDictionary = {};
    ctx.entryTree = {};
    ctx.i18nFramework = I18N_FRAMEWORK.none;
    ctx.namespaceStrategy = NAMESPACE_STRATEGY.none;
    ctx.fixQuery.entriesToGen = true;
    ctx.fixQuery.entriesToFill = false;
    ctx.keyStrategy = KEY_STRATEGY.english;
    ctx.keyPrefix = "auto-popular";
    ctx.nameSeparator = ".";
    ctx.stopPrefixes = [];
    ctx.entryClassTree = [
      {
        filePos: "",
        data: {
          app: {
            common: {},
            dialog: {}
          }
        }
      }
    ];
    ctx.updatePayloads = [];
    ctx.patchedEntryIdInfo = {};
    ctx.undefinedEntryList = [
      {
        raw: 't("Hello")',
        vars: [],
        pos: "0,5,0,5",
        path: path.join(__dirname, "..", "..", "fixtures", "project-simple", "src", "index.ts"),
        nameInfo: {
          text: "Hello",
          regex: /^Hello$/,
          name: "Hello",
          boundPrefix: "",
          boundKey: "",
          vars: []
        }
      }
    ];
    const handler = new FixHandler(ctx);
    await handler.run();
    assert.ok(ctx.updatePayloads.some(p => p.key === "app.hello"));
  });
});
