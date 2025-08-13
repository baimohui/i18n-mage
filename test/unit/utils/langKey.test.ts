import * as assert from "assert";
// import * as sinon from "sinon";
// import * as configModule from "@/utils/config";
import { LANG_CODE_MAPPINGS, getLangIntro, getLangText, getLangCode } from "@/utils/langKey";

describe("const.js 多语言工具", () => {
  // let sandbox: sinon.SinonSandbox;
  // beforeEach(() => {
  //   sandbox = sinon.createSandbox();
  //   // Mock VS Code 配置
  //   sandbox.stub(configModule, "getConfig").callsFake((key: string) => {
  //     if (key === "langAliasCustomMappings") {
  //       return {
  //         "zh-cn": ["custom-cn", "my-zh"],
  //         ja: ["jp-alt"]
  //       };
  //     }
  //     return undefined;
  //   });
  // });
  // afterEach(() => {
  //   sandbox.restore();
  // });

  describe("基础映射数据", () => {
    it("应包含所有支持的语言", () => {
      assert.ok(Object.hasOwn(LANG_CODE_MAPPINGS, "en"), "应包含英语");
      assert.ok(Object.hasOwn(LANG_CODE_MAPPINGS, "zh-cn"), "应包含简体中文");
      assert.ok(Object.hasOwn(LANG_CODE_MAPPINGS, "ja"), "应包含日语");
    });

    it("每种语言应包含完整字段", () => {
      Object.entries(LANG_CODE_MAPPINGS).forEach(([key, value]) => {
        assert.ok(key, "语言键不应为空");
        assert.ok(value.cnName, `${key} 应包含中文名`);
        assert.ok(value.enName, `${key} 应包含英文名`);
        assert.ok(value.ggCode, `${key} 应包含谷歌代码`);
      });
    });
  });

  describe("getLangIntro()", () => {
    it("应正确匹配标准语言代码", () => {
      assert.deepStrictEqual(getLangIntro("en"), LANG_CODE_MAPPINGS["en"]);
      assert.deepStrictEqual(getLangIntro("zh-CN"), LANG_CODE_MAPPINGS["zh-cn"]);
    });

    it("应忽略大小写", () => {
      assert.deepStrictEqual(getLangIntro("EN"), LANG_CODE_MAPPINGS["en"]);
      assert.deepStrictEqual(getLangIntro("Zh-Cn"), LANG_CODE_MAPPINGS["zh-cn"]);
    });

    it("应处理带区域码的情况", () => {
      assert.deepStrictEqual(getLangIntro("en-US"), LANG_CODE_MAPPINGS["en"]);
      assert.deepStrictEqual(getLangIntro("zh-TW"), LANG_CODE_MAPPINGS["zh-tw"]);
    });

    it("应匹配平台特定代码", () => {
      // 测试百度代码
      assert.deepStrictEqual(getLangIntro("jp"), LANG_CODE_MAPPINGS["ja"]);
      // 测试腾讯代码
      assert.deepStrictEqual(getLangIntro("zh"), LANG_CODE_MAPPINGS["zh-cn"]);
    });

    it("应处理带数字的区域码", () => {
      assert.deepStrictEqual(getLangIntro("es-419"), LANG_CODE_MAPPINGS["es"]);
    });

    it("未知语言应返回 null", () => {
      assert.strictEqual(getLangIntro("xx"), null);
      assert.strictEqual(getLangIntro("invalid"), null);
    });
  });

  describe("getLangText()", () => {
    it("应返回正确的中文名", () => {
      assert.strictEqual(getLangText("en", "cn"), "英语");
      assert.strictEqual(getLangText("ja", "cn"), "日语");
    });

    it("应返回正确的英文名", () => {
      assert.strictEqual(getLangText("en", "en"), "English");
      assert.strictEqual(getLangText("ja", "en"), "Japanese");
    });

    it("未知语言应返回空字符串", () => {
      assert.strictEqual(getLangText("xx", "cn"), "");
      assert.strictEqual(getLangText("invalid", "en"), "");
    });
  });

  describe("getLangCode()", () => {
    it("应返回正确的谷歌代码", () => {
      assert.strictEqual(getLangCode("zh-CN", "google"), "zh-CN");
      assert.strictEqual(getLangCode("ja", "google"), "ja");
    });

    it("应返回正确的腾讯代码", () => {
      assert.strictEqual(getLangCode("zh-CN", "tencent"), "zh");
      assert.strictEqual(getLangCode("en", "tencent"), "en");
    });

    it("应返回正确的百度代码", () => {
      assert.strictEqual(getLangCode("zh-CN", "baidu"), "zh");
      assert.strictEqual(getLangCode("ja", "baidu"), "jp");
    });

    it("无对应平台代码应返回 null", () => {
      assert.strictEqual(getLangCode("co", "baidu"), null); // 科西嘉语无百度代码
    });
  });

  describe("自定义别名", () => {
    it("应合并自定义别名", () => {
      assert.deepStrictEqual(getLangIntro("custom-cn"), LANG_CODE_MAPPINGS["zh-cn"]);
      assert.deepStrictEqual(getLangIntro("jp-alt"), LANG_CODE_MAPPINGS["ja"]);
    });
  });
});
