import * as assert from "assert";
import path from "path";
import { ReadHandler } from "@/core/handlers/ReadHandler";
import { createLangContext } from "@/core/context";
import { I18N_FRAMEWORK, LANGUAGE_STRUCTURE, NAMESPACE_STRATEGY } from "@/types";
import { setCacheConfig, clearConfigCache } from "@/utils/config";

describe("core/handlers/ReadHandler", () => {
  const langPath = path.join(__dirname, "..", "..", "fixtures", "langs");
  const arrayLangPath = path.join(__dirname, "..", "..", "fixtures", "langs-array");
  const projectPath = path.join(__dirname, "..", "..", "fixtures", "project-simple");
  const sourceFile = path.join(projectPath, "src", "index.ts");

  beforeEach(() => {
    clearConfigCache("");
    setCacheConfig("analysis.fileExtensions", [".ts", ".js", ".json"]);
    setCacheConfig("workspace.ignoredFiles", []);
    setCacheConfig("workspace.ignoredDirectories", []);
    setCacheConfig("workspace.languagePath", "");
  });

  it("readLangFiles 应构建字典与结构", () => {
    const ctx = createLangContext();
    ctx.langPath = langPath;
    ctx.namespaceStrategy = NAMESPACE_STRATEGY.none;
    ctx.languageStructure = LANGUAGE_STRUCTURE.auto;
    ctx.ignoredLangs = [];
    const handler = new ReadHandler(ctx);
    handler.readLangFiles();

    assert.strictEqual(ctx.langFileType, "json");
    assert.strictEqual(ctx.langCountryMap["en"]["app.title"], "Hello");
    assert.strictEqual(ctx.langDictionary["app.title"].value.en, "Hello");
    assert.strictEqual(ctx.languageStructure, LANGUAGE_STRUCTURE.nested);
  });

  it("readLangFiles 应支持数组值并将数组元素写入字典", () => {
    const ctx = createLangContext();
    ctx.langPath = arrayLangPath;
    ctx.namespaceStrategy = NAMESPACE_STRATEGY.none;
    ctx.languageStructure = LANGUAGE_STRUCTURE.auto;
    ctx.ignoredLangs = [];
    const handler = new ReadHandler(ctx);
    handler.readLangFiles();

    assert.strictEqual(ctx.langCountryMap.en["app.tips.0"], "First tip");
    assert.strictEqual(ctx.langCountryMap.en["app.sections.quickStart.1"], "Choose language");
    assert.strictEqual(ctx.langDictionary["app.tips.1"].value["zh-cn"], "第二条提示");
    assert.strictEqual(ctx.langDictionary["app.sections.quickStart.0"].value.en, "Open app");
    assert.ok(Array.isArray((ctx.entryTree.app as Record<string, unknown>).tips));
    assert.ok(Array.isArray(((ctx.entryTree.app as Record<string, unknown>).sections as Record<string, unknown>).quickStart));
  });

  it("startCensus 应统计已用与未定义词条", () => {
    const ctx = createLangContext();
    ctx.langPath = langPath;
    ctx.projectPath = projectPath;
    ctx.namespaceStrategy = NAMESPACE_STRATEGY.none;
    ctx.i18nFramework = I18N_FRAMEWORK.none;
    ctx.scanStringLiterals = true;
    ctx.globalFlag = true;
    ctx.ignoredLangs = [];
    const handler = new ReadHandler(ctx);
    handler.readLangFiles();
    handler.startCensus();

    assert.ok(Boolean(ctx.usedEntryMap["app.title"]?.[sourceFile]));
    assert.ok(ctx.usedLiteralKeySet.has("app.title"));
    assert.ok(ctx.undefinedEntryList.some(item => item.nameInfo.text === "missing.key"));
    assert.ok(ctx.unusedKeySet.has("app.menu.file"));
  });
});
