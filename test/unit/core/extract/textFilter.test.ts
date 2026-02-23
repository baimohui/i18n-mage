import * as assert from "assert";
import { isInvalidHardcodedText } from "@/core/extract/textFilter";

describe("core/extract/textFilter", () => {
  it("should mark known noise strings as invalid", () => {
    const invalidCases = [
      "https://github.com/baimohui/i18n-mage",
      "</script>",
      "</template>",
      "\\u003c",
      "\\n",
      "$t",
      "[object Object]",
      "[object Array]",
      "*.json",
      "\\s*[\\{\\[]",
      "\\.\\d+",
      "--date=short",
      "--pretty=format:%H%x09%h%x09%cs%x09%s",
      "%H%x09%h%x09%cs%x09%s",
      "#000",
      "rgb(0,0,0)",
      "app.config.path",
      "C:\\temp\\a.txt",
      "/src/views/App.vue",
      "undefined",
      "NaN",
      "{ row, column, $index }",
      "{ data }"
    ];

    invalidCases.forEach(text => {
      assert.strictEqual(isInvalidHardcodedText(text), true, `expected invalid: ${text}`);
    });
  });

  it("should keep natural-language text as valid", () => {
    const validCases = ["文本一", "文本二", "Hello world", "请选择日期", "Click to continue", "评分", "订单状态"];

    validCases.forEach(text => {
      assert.strictEqual(isInvalidHardcodedText(text), false, `expected valid: ${text}`);
    });
  });
});
