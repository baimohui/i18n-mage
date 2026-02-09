import * as assert from "assert";
import { getCacheConfig, getConfig, clearConfigCache, setCacheConfig, setConfig } from "@/utils/config";
import { getUpdateCalls, setConfigValue } from "../../helpers/vscodeMock";

describe("utils/config", () => {
  it("getConfig 应读取配置值或默认值", () => {
    setConfigValue("general.enable", false);
    assert.strictEqual(getConfig<boolean>("general.enable", true), false);
    assert.strictEqual(getConfig<string>("general.missing", "fallback"), "fallback");
  });

  it("getCacheConfig 应缓存首次读取的值", () => {
    setConfigValue("analysis.scanStringLiterals", true);
    assert.strictEqual(getCacheConfig<boolean>("analysis.scanStringLiterals", false), true);
    setConfigValue("analysis.scanStringLiterals", false);
    assert.strictEqual(getCacheConfig<boolean>("analysis.scanStringLiterals", true), true);
    clearConfigCache("analysis.scanStringLiterals");
    assert.strictEqual(getCacheConfig<boolean>("analysis.scanStringLiterals", true), false);
  });

  it("setCacheConfig 应覆盖缓存值", () => {
    setCacheConfig("writeRules.keyPrefix", "manual");
    assert.strictEqual(getCacheConfig<string>("writeRules.keyPrefix"), "manual");
  });

  it("clearConfigCache 支持前缀清理", () => {
    setCacheConfig("writeRules.keyStyle", "camelCase");
    setCacheConfig("writeRules.keyStrategy", "english");
    clearConfigCache("writeRules");
    assert.strictEqual(getCacheConfig<string>("writeRules.keyStyle", "snake_case"), "snake_case");
    assert.strictEqual(getCacheConfig<string>("writeRules.keyStrategy", "pinyin"), "pinyin");
  });

  it("setConfig 应调用配置更新并记录目标范围", async () => {
    await setConfig("general.enable", true, "workspace");
    const calls = getUpdateCalls();
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], {
      key: "general.enable",
      value: true,
      target: 2
    });
  });
});
