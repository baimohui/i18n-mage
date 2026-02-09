import * as assert from "assert";
import { createLangContext } from "@/core/context";
import { INDENT_TYPE, INVALID_KEY_STRATEGY, KEY_GENERATION_FILL_SCOPE, KEY_STRATEGY, KEY_STYLE, LANGUAGE_STRUCTURE } from "@/types";

describe("core/context", () => {
  it("createLangContext 应包含合理默认值", () => {
    const ctx = createLangContext();
    assert.strictEqual(ctx.task, "");
    assert.strictEqual(ctx.keyGenerationFillScope, KEY_GENERATION_FILL_SCOPE.all);
    assert.strictEqual(ctx.keyStyle, KEY_STYLE.camelCase);
    assert.strictEqual(ctx.keyStrategy, KEY_STRATEGY.english);
    assert.strictEqual(ctx.indentType, INDENT_TYPE.auto);
    assert.strictEqual(ctx.invalidKeyStrategy, INVALID_KEY_STRATEGY.ai);
    assert.strictEqual(ctx.languageStructure, LANGUAGE_STRUCTURE.auto);
    assert.ok(ctx.usedKeySet instanceof Set);
  });

  it("createLangContext 每次调用应返回独立实例", () => {
    const ctx1 = createLangContext();
    const ctx2 = createLangContext();
    ctx1.usedKeySet.add("a");
    assert.strictEqual(ctx2.usedKeySet.has("a"), false);
  });
});
