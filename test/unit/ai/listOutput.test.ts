import * as assert from "assert";
import { buildIndexedItems, parseListOutput } from "@/ai/shared/listOutput";

describe("ai/shared/listOutput", () => {
  it("buildIndexedItems should keep input order with item index", () => {
    const built = buildIndexedItems(["a", "b"]);
    assert.strictEqual(built, `<item i="0">a</item>\n<item i="1">b</item>`);
  });

  it("parseListOutput should parse JSON array", () => {
    const result = parseListOutput(`["k1","k2"]`, "[[[SEP]]]", 2);
    assert.deepStrictEqual(result, ["k1", "k2"]);
  });

  it("parseListOutput should parse separator output", () => {
    const result = parseListOutput("k1[[[SEP]]]k2", "[[[SEP]]]", 2);
    assert.deepStrictEqual(result, ["k1", "k2"]);
  });

  it("parseListOutput should parse plain line output", () => {
    const result = parseListOutput("k1\nk2", "[[[SEP]]]", 2);
    assert.deepStrictEqual(result, ["k1", "k2"]);
  });
});
