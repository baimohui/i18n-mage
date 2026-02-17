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

  it("extractContent should extract object body with prefix and suffix", () => {
    const content = `// comment\nexport default {\n  "a": 1,\n  "b": "x"\n};\n`;
    const [prefix, body, suffix] = extractContent(content);
    assert.ok(prefix.includes("export default"));
    assert.ok(body.trim().startsWith("{"));
    assert.ok(suffix.trim().startsWith(";"));
  });

  it("jsonParse should parse JSON5 and fallback to eval", () => {
    assert.deepStrictEqual(jsonParse("{a:1}"), { a: 1 });
    assert.deepStrictEqual(jsonParse("{ a: 2, b: 'x' }"), { a: 2, b: "x" });
    assert.deepStrictEqual(jsonParse("{a:3}"), { a: 3 });
  });

  it("getLangFileInfo should parse language file and return extra info", () => {
    const filePath = path.join(fixturesRoot, "en", "common.json");
    const info = getLangFileInfo(filePath);
    assert.strictEqual(info !== null, true);
    assert.strictEqual(info?.extraInfo.isFlat, false);
    assert.strictEqual(info?.extraInfo.keyQuotes, "double");
  });

  it("isValidI18nCallablePath should filter by extension and ignored dirs", () => {
    setCacheConfig("workspace.ignoredFiles", []);
    setCacheConfig("workspace.ignoredDirectories", []);
    setCacheConfig("workspace.languagePath", "");
    setCacheConfig("general.fileExtensions", [".json", ".js"]);
    const okFile = path.join(fixturesRoot, "en", "common.json");
    const badExt = path.join(fixturesRoot, "en", "common.txt");
    assert.strictEqual(isValidI18nCallablePath(okFile), true);
    assert.strictEqual(isValidI18nCallablePath(badExt), false);
  });

  it("getNestedValues/flattenNestedObj/expandDotKeys should stay consistent", () => {
    const obj = { a: { b: "x" }, "c.d": "y" };
    const flat = flattenNestedObj(obj);
    assert.deepStrictEqual(flat, { "a.b": "x", "c\\.d": "y" });
    const expanded = expandDotKeys({ "a.b": "x", "c.d": "y" });
    assert.deepStrictEqual(expanded, { a: { b: "x" }, c: { d: "y" } });
    const values = getNestedValues(expanded);
    assert.deepStrictEqual(values.sort(), ["x", "y"]);
  });

  it("extractLangDataFromDir should scan dir and return structure", () => {
    const res = extractLangDataFromDir(fixturesRoot);
    assert.notStrictEqual(res, null);
    const nonNull = res as NonNullable<typeof res>;
    assert.strictEqual(nonNull.fileType, "json");
    assert.strictEqual(nonNull.fileStructure.children.en !== undefined, true);
    assert.strictEqual(nonNull.fileExtraInfo["en.common"] !== undefined, true);
  });

  it("stripLanguageLayer should remove language level", () => {
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

  it("detectQuoteStyle should return most used quote style", () => {
    const code = `{"a":"x","b":"y",'c':'z'}`;
    const res = detectQuoteStyle(code);
    assert.strictEqual(res.key, "double");
    assert.strictEqual(res.value, "double");
  });

  it("detectIndent should detect common indentation", () => {
    const content = `{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}`;
    const res = detectIndent(content);
    assert.deepStrictEqual(res, { type: "space", size: 2 });
  });

  it("detectI18nFramework should infer framework from dependencies", () => {
    const root = path.join(__dirname, "..", "..", "fixtures", "projects");
    assert.strictEqual(detectI18nFramework(path.join(root, "vue")), I18N_FRAMEWORK.vueI18n);
    assert.strictEqual(detectI18nFramework(path.join(root, "react")), I18N_FRAMEWORK.reactI18next);
    assert.strictEqual(detectI18nFramework(path.join(root, "i18next")), I18N_FRAMEWORK.i18nNext);
    assert.strictEqual(detectI18nFramework(path.join(root, "vscode")), I18N_FRAMEWORK.vscodeL10n);
  });
});
