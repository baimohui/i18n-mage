import * as assert from "assert";
import { parseCustomProviders } from "@/ai/shared/customProviders";

describe("ai/shared/customProviders", () => {
  it("should parse valid custom providers and prepend custom: prefix", () => {
    const result = parseCustomProviders([
      {
        id: "acme-ai",
        baseUrl: "https://api.acme.com/v1/chat/completions",
        apiKey: "k1",
        model: "acme-model",
        enabled: true,
        useProxy: false
      }
    ]);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "custom:acme-ai");
    assert.strictEqual(result[0].useProxy, false);
    assert.deepStrictEqual(result[0].translateBatchConfig, { maxLen: 4000, batchSize: 20, interval: 800 });
  });

  it("should ignore invalid, disabled and duplicate providers", () => {
    const result = parseCustomProviders([
      {
        id: "demo",
        baseUrl: "https://api.demo.com/v1/chat/completions",
        apiKey: "k1",
        model: "m1"
      },
      {
        id: "custom:demo",
        baseUrl: "https://api.demo.com/v1/chat/completions",
        apiKey: "k2",
        model: "m2"
      },
      {
        id: "bad id",
        baseUrl: "https://api.bad.com/v1/chat/completions",
        apiKey: "k3",
        model: "m3"
      },
      {
        id: "off",
        baseUrl: "https://api.off.com/v1/chat/completions",
        apiKey: "k4",
        model: "m4",
        enabled: false
      }
    ]);

    assert.deepStrictEqual(
      result.map(item => item.id),
      ["custom:demo"]
    );
    assert.strictEqual(result[0].apiKey, "k1");
  });
});
