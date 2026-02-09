import * as assert from "assert";
import path from "path";
import { ReadHandler } from "@/core/handlers/ReadHandler";
import { createLangContext } from "@/core/context";
import { I18N_FRAMEWORK, LANGUAGE_STRUCTURE, NAMESPACE_STRATEGY } from "@/types";
import { setCacheConfig, clearConfigCache } from "@/utils/config";

describe("core/handlers/ReadHandler", () => {
  const langPath = path.join(__dirname, "..", "..", "fixtures", "langs");
  const projectPath = path.join(__dirname, "..", "..", "fixtures", "project-simple");
  const sourceFile = path.join(projectPath, "src", "index.ts");

  beforeEach(() => {
    clearConfigCache("");
    setCacheConfig("general.fileExtensions", [".ts", ".js", ".json"]);
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
