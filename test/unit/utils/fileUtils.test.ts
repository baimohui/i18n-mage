import * as assert from "assert";
import path from "path";
import {
  detectI18nFramework,
  detectIndent,
  detectQuoteStyle,
  expandDotKeys,
  extractContent,
  extractLangDataFromDir,
  flattenNestedObj,
  getLangFileInfo,
  getNestedValues,
  isValidI18nCallablePath,
  jsonParse,
  stripLanguageLayer
} from "@/utils/regex/fileUtils";
import { setCacheConfig, clearConfigCache } from "@/utils/config";
import { I18N_FRAMEWORK } from "@/types";

const fixturesRoot = path.join(__dirname, "..", "..", "fixtures", "langs");

describe("utils/regex/fileUtils", () => {
  beforeEach(() => {
    clearConfigCache("");
  });

  it("extractContent 应提取对象主体并保留前后缀", () => {
    const content = `// comment\nexport default {\n  "a": 1,\n  "b": "x"\n};\n`;
    const [prefix, body, suffix] = extractContent(content);
    assert.ok(prefix.includes("export default"));
    assert.ok(body.trim().startsWith("{"));
    assert.ok(suffix.trim().startsWith(";"));
  });

  it("jsonParse 应支持 json5/eval/auto", () => {
    setCacheConfig("analysis.languageFileParser", "json5");
    assert.deepStrictEqual(jsonParse("{a:1}"), { a: 1 });

    setCacheConfig("analysis.languageFileParser", "eval");
    assert.deepStrictEqual(jsonParse("{ a: 2, b: 'x' }"), { a: 2, b: "x" });

    setCacheConfig("analysis.languageFileParser", "auto");
    assert.deepStrictEqual(jsonParse("{a:3}"), { a: 3 });
  });

  it("getLangFileInfo 应解析语言文件并返回 extraInfo", () => {
    const filePath = path.join(fixturesRoot, "en", "common.json");
    const info = getLangFileInfo(filePath);
    assert.strictEqual(info !== null, true);
    assert.strictEqual(info?.extraInfo.isFlat, false);
    assert.strictEqual(info?.extraInfo.keyQuotes, "double");
  });

  it("isValidI18nCallablePath 应过滤扩展名与忽略目录", () => {
    setCacheConfig("workspace.ignoredFiles", []);
    setCacheConfig("workspace.ignoredDirectories", []);
    setCacheConfig("workspace.languagePath", "");
    setCacheConfig("general.fileExtensions", [".json", ".js"]);
    const okFile = path.join(fixturesRoot, "en", "common.json");
    const badExt = path.join(fixturesRoot, "en", "common.txt");
    assert.strictEqual(isValidI18nCallablePath(okFile), true);
    assert.strictEqual(isValidI18nCallablePath(badExt), false);
  });

  it("getNestedValues/flattenNestedObj/expandDotKeys 应保持一致性", () => {
    const obj = { a: { b: "x" }, "c.d": "y" };
    const flat = flattenNestedObj(obj);
    assert.deepStrictEqual(flat, { "a.b": "x", "c\\.d": "y" });
    const expanded = expandDotKeys({ "a.b": "x", "c.d": "y" });
    assert.deepStrictEqual(expanded, { a: { b: "x" }, c: { d: "y" } });
    const values = getNestedValues(expanded);
    assert.deepStrictEqual(values.sort(), ["x", "y"]);
  });

  it("extractLangDataFromDir 应扫描目录并返回结构信息", () => {
    const res = extractLangDataFromDir(fixturesRoot);
    assert.notStrictEqual(res, null);
    const nonNull = res as NonNullable<typeof res>;
    assert.strictEqual(nonNull.fileType, "json");
    assert.strictEqual(nonNull.fileStructure.children.en !== undefined, true);
    assert.strictEqual(nonNull.fileExtraInfo["en.common"] !== undefined, true);
  });

  it("stripLanguageLayer 应移除语言层级", () => {
    const root = {
      type: "directory" as const,
      children: {
        en: { type: "directory" as const, children: { common: { type: "file" as const, ext: "json" } } },
        "zh-cn": { type: "directory" as const, children: { common: { type: "file" as const, ext: "json" } } }
      }
    };
    const res = stripLanguageLayer(root);
    assert.strictEqual(res !== null, true);
    assert.strictEqual(res?.children.common !== undefined, true);
  });

  it("detectQuoteStyle 应返回使用频率最高的引号", () => {
    const code = `{"a":"x","b":"y",'c':'z'}`;
    const res = detectQuoteStyle(code);
    assert.strictEqual(res.key, "double");
    assert.strictEqual(res.value, "double");
  });

  it("detectIndent 应识别常见缩进", () => {
    const content = `{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}`;
    const res = detectIndent(content);
    assert.deepStrictEqual(res, { type: "space", size: 2 });
  });

  it("detectI18nFramework 应根据依赖判断框架", () => {
    const root = path.join(__dirname, "..", "..", "fixtures", "projects");
    assert.strictEqual(detectI18nFramework(path.join(root, "vue")), I18N_FRAMEWORK.vueI18n);
    assert.strictEqual(detectI18nFramework(path.join(root, "react")), I18N_FRAMEWORK.reactI18next);
    assert.strictEqual(detectI18nFramework(path.join(root, "i18next")), I18N_FRAMEWORK.i18nNext);
    assert.strictEqual(detectI18nFramework(path.join(root, "vscode")), I18N_FRAMEWORK.vscodeL10n);
  });
});
