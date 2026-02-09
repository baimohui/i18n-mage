import * as assert from "assert";
import path from "path";
import {
  formatEscapeChar,
  formatForFile,
  formatObjectToString,
  getLineEnding,
  isEnglishVariable,
  unFormatEscapeChar,
  validateLang
} from "@/utils/regex/formatUtils";
import { setCacheConfig, clearConfigCache } from "@/utils/config";
import { clearActiveEditor, setActiveEditor, setFilesConfigValue } from "../../helpers/vscodeMock";

describe("utils/regex/formatUtils", () => {
  beforeEach(() => {
    clearConfigCache("");
  });

  it("getLineEnding 应优先使用活动文档 EOL", () => {
    setActiveEditor("a\r\nb\r\n", 2);
    assert.strictEqual(getLineEnding(), "\r\n");
  });

  it("getLineEnding 应回退到用户配置", () => {
    clearActiveEditor();
    setFilesConfigValue("eol", "\n");
    assert.strictEqual(getLineEnding(), "\n");
  });

  it("getLineEnding 应可从文件内容判断", () => {
    clearActiveEditor();
    const filePath = path.join(__dirname, "..", "..", "fixtures", "langs", "en", "common.json");
    assert.strictEqual(getLineEnding(filePath), "\n");
  });

  it("validateLang 应校验语种内容", () => {
    assert.strictEqual(validateLang("你好", "zh-CN"), true);
    assert.strictEqual(validateLang("Hello!", "en"), true);
    assert.strictEqual(validateLang("你好", "en"), false);
  });

  it("formatObjectToString 应输出正确结构与引号", () => {
    setCacheConfig("writeRules.allowDotInNestedKey", true);
    const tree = { app: { title: "Hello" }, "a.b": "x" };
    const extraInfo = {
      indentType: "space" as const,
      indentSize: 2,
      isFlat: true,
      keyQuotes: "double" as const,
      valueQuotes: "double" as const,
      prefix: "",
      suffix: "",
      innerVar: ""
    };
    const output = formatObjectToString(tree, "test.json", extraInfo);
    assert.ok(output.includes('"app.title": "Hello"'));
    assert.ok(output.includes('"a.b": "x"'));
  });

  it("formatForFile/formatEscapeChar/unFormatEscapeChar 应相互匹配", () => {
    const raw = "a\nb\tc\\d";
    const escaped = formatEscapeChar(raw);
    assert.strictEqual(escaped, "a\\nb\\tc\\\\d");
    assert.strictEqual(unFormatEscapeChar(escaped), raw);
    assert.strictEqual(formatForFile('a"b', true), '"a\\"b"');
    assert.strictEqual(formatForFile("a'b", false), "'a\\'b'");
  });

  it("isEnglishVariable 应识别常见命名风格", () => {
    assert.strictEqual(isEnglishVariable("user_name"), true);
    assert.strictEqual(isEnglishVariable("userName"), true);
    assert.strictEqual(isEnglishVariable("user-name"), true);
    assert.strictEqual(isEnglishVariable("CPU"), false);
  });
});
