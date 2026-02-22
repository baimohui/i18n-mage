import * as assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { scanHardcodedTextCandidates } from "@/core/extract/astExtractService";
import { setCacheConfig } from "@/utils/config";

function writeFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("core/extract/astExtractService", () => {
  let projectPath = "";

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-mage-extract-"));
    setCacheConfig("workspace.ignoredFiles", []);
    setCacheConfig("workspace.ignoredDirectories", []);
    setCacheConfig("workspace.languagePath", "");
    setCacheConfig("analysis.fileExtensions", [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs", ".vue"]);
  });

  afterEach(() => {
    if (projectPath) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("should filter non-translatable hardcoded strings", () => {
    writeFile(
      projectPath,
      "src/sample.ts",
      `
      const a = "https://github.com/baimohui/i18n-mage";
      const b = "</script>";
      const c = "\\\\u003c";
      const d = "$t";
      const e = "[object Object]";
      const f = "*.json";
      const g = "\\\\s*[\\\\{\\\\[]";
      const h = "\\\\.\\\\d+";
      const k = "--date=short";
      const l = "--pretty=format:%H%x09%h%x09%cs%x09%s";
      const i = "文本一";
      const j = "Hello world";
      `
    );

    const result = scanHardcodedTextCandidates({
      projectPath,
      fileExtensions: [".ts"]
    });
    const texts = result.candidates.map(item => item.text);

    assert.ok(texts.includes("文本一"));
    assert.ok(texts.includes("Hello world"));
    assert.ok(!texts.includes("https://github.com/baimohui/i18n-mage"));
    assert.ok(!texts.includes("</script>"));
    assert.ok(!texts.includes("\\u003c"));
    assert.ok(!texts.includes("$t"));
    assert.ok(!texts.includes("[object Object]"));
    assert.ok(!texts.includes("*.json"));
    assert.ok(!texts.includes("\\s*[\\{\\[]"));
    assert.ok(!texts.includes("\\.\\d+"));
    assert.ok(!texts.includes("--date=short"));
    assert.ok(!texts.includes("--pretty=format:%H%x09%h%x09%cs%x09%s"));
  });

  it("should extract vue template text and attrs while filtering invalid attrs", () => {
    writeFile(
      projectPath,
      "src/demo.vue",
      `
      <template>
        <el-form-item label="选择器" prop="region">
          <el-select placeholder="请选择" data-color="#000">
            <el-option label="小明" value="1"></el-option>
          </el-select>
          <span>文本二</span>
        </el-form-item>
      </template>
      `
    );

    const result = scanHardcodedTextCandidates({
      projectPath,
      fileExtensions: [".vue"]
    });
    const texts = result.candidates.map(item => item.text);

    assert.ok(texts.includes("选择器"));
    assert.ok(texts.includes("请选择"));
    assert.ok(texts.includes("小明"));
    assert.ok(texts.includes("文本二"));
    assert.ok(!texts.includes("#000"));
  });

  it("should respect source-language-only extraction", () => {
    writeFile(
      projectPath,
      "src/lang.ts",
      `
      const cn = "文本三";
      const en = "English Text";
      `
    );

    const result = scanHardcodedTextCandidates({
      projectPath,
      fileExtensions: [".ts"],
      sourceLanguage: "zh-CN",
      onlyExtractSourceLanguageText: true
    });
    const texts = result.candidates.map(item => item.text);

    assert.ok(texts.includes("文本三"));
    assert.ok(!texts.includes("English Text"));
  });
});
