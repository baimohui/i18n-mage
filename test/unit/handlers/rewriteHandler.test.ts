/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
import * as assert from "assert";
import mockRequire from "mock-require";
import path from "path";
import { createLangContext } from "@/core/context";
import { INDENT_TYPE, LANGUAGE_STRUCTURE, NAMESPACE_STRATEGY } from "@/types";

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

describe("core/handlers/RewriteHandler", () => {
  beforeEach(() => {
    mockRequire.stop("fs");
    mockRequire.stop("@/utils/fs");
    mockRequire.stop("@/utils/regex");
    mockRequire.stop("@/core/handlers/RewriteHandler");
    resetHandlerModule("@/core/handlers/RewriteHandler");
  });

  it("add payload 应更新字典并写入文件", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    mockRequire("fs", {
      promises: {
        mkdir: async () => undefined,
        writeFile: async (p: string, c: string) => writes.push({ path: p, content: c })
      },
      readFileSync: () => ""
    });
    mockRequire("@/utils/fs", {
      checkPathExists: async () => true,
      toAbsolutePath: (p: string) => p
    });
    mockRequire("@/utils/regex", {
      formatObjectToString: (_obj: unknown, _filePath: string, _extra: unknown) => "content",
      getContentAtLocation: () => ({}),
      getFileLocationFromId: () => ["common"],
      getPathSegsFromId: (id: string) => id.split("."),
      setValueByEscapedEntryName: (tree: any, key: string, value: string | undefined) => {
        if (value === undefined) {
          delete tree[key];
        } else {
          tree[key] = value;
        }
      }
    });
    const { RewriteHandler } = require("@/core/handlers/RewriteHandler");

    const ctx = createLangContext();
    ctx.langPath = path.join("lang");
    ctx.langFileType = "json";
    ctx.fileStructure = { type: "directory", children: {} } as any;
    ctx.namespaceStrategy = NAMESPACE_STRATEGY.none;
    ctx.avgFileNestedLevel = 0;
    ctx.languageStructure = LANGUAGE_STRUCTURE.flat;
    ctx.langCountryMap = { en: {} };
    ctx.langDictionary = {};
    ctx.entryTree = {};
    ctx.langFileExtraInfo = {
      en: {
        prefix: "",
        suffix: "",
        innerVar: "",
        indentType: INDENT_TYPE.space,
        indentSize: 2,
        isFlat: true,
        keyQuotes: "double",
        valueQuotes: "double"
      }
    };
    ctx.updatePayloads = [
      {
        type: "add",
        key: "app.title",
        valueChanges: {
          en: { after: "Hello" }
        }
      }
    ];
    const res = await new RewriteHandler(ctx).run();
    assert.strictEqual(res.success, true);
    assert.strictEqual(ctx.langDictionary["app.title"].value.en, "Hello");
    assert.strictEqual(ctx.langCountryMap.en["app.title"], "Hello");
    assert.strictEqual(writes.length, 1);
  });

  it("rename payload 应更新 key 映射并写入", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    mockRequire("fs", {
      promises: {
        mkdir: async () => undefined,
        writeFile: async (p: string, c: string) => writes.push({ path: p, content: c })
      },
      readFileSync: () => ""
    });
    mockRequire("@/utils/fs", {
      checkPathExists: async () => true,
      toAbsolutePath: (p: string) => p
    });
    mockRequire("@/utils/regex", {
      formatObjectToString: (_obj: unknown, _filePath: string, _extra: unknown) => "content",
      getContentAtLocation: () => ({}),
      getFileLocationFromId: () => ["common"],
      getPathSegsFromId: (id: string) => id.split("."),
      setValueByEscapedEntryName: (tree: any, key: string, value: string | undefined) => {
        if (value === undefined) {
          delete tree[key];
        } else {
          tree[key] = value;
        }
      }
    });
    const { RewriteHandler } = require("@/core/handlers/RewriteHandler");

    const ctx = createLangContext();
    ctx.langPath = "lang";
    ctx.langFileType = "json";
    ctx.fileStructure = { type: "directory", children: {} } as any;
    ctx.langCountryMap = { en: { "old.key": "Hello" } };
    ctx.langDictionary = {
      "old.key": { fullPath: "old.key", fileScope: "common", value: { en: "Hello" } }
    };
    ctx.entryTree = { "old.key": "old.key" };
    ctx.updatePayloads = [
      {
        type: "rename",
        key: "old.key",
        keyChange: {
          key: { after: "new.key" },
          filePos: { before: "common", after: "common" },
          fullPath: { after: "new.key" }
        }
      }
    ];
    const res = await new RewriteHandler(ctx).run();
    assert.strictEqual(res.success, true);
    assert.strictEqual(ctx.langCountryMap.en["new.key"], "Hello");
    assert.ok(!Object.hasOwn(ctx.langCountryMap.en, "old.key"));
    assert.ok(Object.hasOwn(ctx.langDictionary, "new.key"));
    assert.strictEqual(writes.length, 1);
  });

  it("rewriteAll 在 flat + 单文件模式应重写全部", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    mockRequire("fs", {
      promises: {
        mkdir: async () => undefined,
        writeFile: async (p: string, c: string) => writes.push({ path: p, content: c })
      },
      readFileSync: () => ""
    });
    mockRequire("@/utils/fs", {
      checkPathExists: async () => true,
      toAbsolutePath: (p: string) => p
    });
    mockRequire("@/utils/regex", {
      formatObjectToString: (_obj: unknown, _filePath: string, _extra: unknown) => "content",
      getContentAtLocation: () => ({}),
      getFileLocationFromId: () => ["common"],
      getPathSegsFromId: (id: string) => id.split("."),
      setValueByEscapedEntryName: (tree: any, key: string, value: string | undefined) => {
        if (value === undefined) {
          delete tree[key];
        } else {
          tree[key] = value;
        }
      }
    });
    const { RewriteHandler } = require("@/core/handlers/RewriteHandler");

    const ctx = createLangContext();
    ctx.langPath = "lang";
    ctx.langFileType = "json";
    ctx.avgFileNestedLevel = 0;
    ctx.languageStructure = LANGUAGE_STRUCTURE.flat;
    ctx.langCountryMap = { en: { "a.key": "A" } };
    ctx.langDictionary = {
      "a.key": { fullPath: "a.key", fileScope: "", value: { en: "A" } }
    };
    ctx.updatePayloads = [
      {
        type: "edit",
        key: "a.key",
        valueChanges: { en: { after: "A" } }
      }
    ];
    const res = await new RewriteHandler(ctx).run(true);
    assert.strictEqual(res.success, true);
    assert.strictEqual(writes.length, 1);
  });

  it("applyGlobalFixes 应按 pos 替换内容", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    mockRequire("fs", {
      promises: {
        mkdir: async () => undefined,
        writeFile: async (p: string, c: string) => writes.push({ path: p, content: c })
      },
      readFileSync: () => `const msg = t("old.key");\n`
    });
    mockRequire("@/utils/fs", {
      checkPathExists: async () => true,
      toAbsolutePath: (p: string) => p
    });
    mockRequire("@/utils/regex", {
      formatObjectToString: (_obj: unknown, _filePath: string, _extra: unknown) => "content",
      getContentAtLocation: () => ({}),
      getFileLocationFromId: () => ["common"],
      getPathSegsFromId: (id: string) => id.split("."),
      setValueByEscapedEntryName: (tree: any, key: string, value: string | undefined) => {
        if (value === undefined) {
          delete tree[key];
        } else {
          tree[key] = value;
        }
      }
    });
    const { RewriteHandler } = require("@/core/handlers/RewriteHandler");

    const ctx = createLangContext();
    ctx.langPath = "lang";
    ctx.langFileType = "json";
    ctx.langCountryMap = { en: { "old.key": "Old" } };
    ctx.langDictionary = {
      "old.key": { fullPath: "old.key", fileScope: "", value: { en: "Old" } }
    };
    ctx.entryTree = { "old.key": "old.key" };
    ctx.patchedEntryIdInfo = {
      "src/index.ts": [
        {
          id: "old.key",
          raw: "old.key",
          fixedRaw: 't("new.key")',
          fixedName: "new.key",
          addedVars: "",
          pos: "14,23,0,24"
        }
      ]
    };
    ctx.updatePayloads = [];
    const res = await new RewriteHandler(ctx).run();
    assert.strictEqual(res.success, true);
    assert.ok(writes.some(w => w.path === "src/index.ts"));
    assert.ok(writes.some(w => w.content.includes('t("new.key")')));
    assert.deepStrictEqual(ctx.patchedEntryIdInfo, {});
  });

  it("多文件结构应按 filePos 写入目标文件", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    mockRequire("fs", {
      promises: {
        mkdir: async () => undefined,
        writeFile: async (p: string, c: string) => writes.push({ path: p, content: c })
      },
      readFileSync: () => ""
    });
    mockRequire("@/utils/fs", {
      checkPathExists: async () => true,
      toAbsolutePath: (p: string) => p
    });
    mockRequire("@/utils/regex", {
      formatObjectToString: (_obj: unknown, _filePath: string, _extra: unknown) => "content",
      getContentAtLocation: () => ({}),
      getFileLocationFromId: () => ["common"],
      getPathSegsFromId: (id: string) => id.split("."),
      setValueByEscapedEntryName: (tree: any, key: string, value: string | undefined) => {
        if (value === undefined) {
          delete tree[key];
        } else {
          tree[key] = value;
        }
      }
    });
    const { RewriteHandler } = require("@/core/handlers/RewriteHandler");

    const ctx = createLangContext();
    ctx.langPath = "lang";
    ctx.langFileType = "json";
    ctx.avgFileNestedLevel = 1;
    ctx.languageStructure = LANGUAGE_STRUCTURE.nested;
    ctx.fileStructure = { type: "directory", children: { common: { type: "file", ext: "json" } } } as any;
    ctx.langCountryMap = { en: {} };
    ctx.langDictionary = {};
    ctx.entryTree = {};
    ctx.langFileExtraInfo = {};
    ctx.updatePayloads = [
      {
        type: "add",
        key: "common.app.title",
        valueChanges: { en: { after: "Hello" } }
      }
    ];
    const res = await new RewriteHandler(ctx).run();
    assert.strictEqual(res.success, true);
    assert.strictEqual(writes.length, 1);
    assert.ok(writes[0].path.includes("lang"));
  });

  it("filePos 定位失败时应抛出 UnknownRewriteError", async () => {
    mockRequire("fs", {
      promises: {
        mkdir: async () => undefined,
        writeFile: async () => undefined
      },
      readFileSync: () => ""
    });
    mockRequire("@/utils/fs", {
      checkPathExists: async () => true,
      toAbsolutePath: (p: string) => p
    });
    mockRequire("@/utils/regex", {
      formatObjectToString: (_obj: unknown, _filePath: string, _extra: unknown) => "content",
      getContentAtLocation: () => null,
      getFileLocationFromId: () => ["missing"],
      getPathSegsFromId: (id: string) => id.split("."),
      setValueByEscapedEntryName: () => undefined
    });
    const { RewriteHandler } = require("@/core/handlers/RewriteHandler");

    const ctx = createLangContext();
    ctx.langPath = "lang";
    ctx.langFileType = "json";
    ctx.avgFileNestedLevel = 1;
    ctx.languageStructure = LANGUAGE_STRUCTURE.nested;
    ctx.langCountryMap = { en: {} };
    ctx.langDictionary = {
      "missing.key": { fullPath: "missing.key", fileScope: "missing", value: { en: "Hello" } }
    };
    ctx.entryTree = {};
    ctx.updatePayloads = [
      {
        type: "edit",
        key: "missing.key",
        valueChanges: { en: { after: "Hello" } }
      }
    ];
    const res = await new RewriteHandler(ctx).run();
    assert.strictEqual(res.code, 403);
  });
});
