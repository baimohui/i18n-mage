import * as assert from "assert";
import { buildUnits, exportPreviewData } from "@/webviews/fix-preview/model";
import { FixPreviewData } from "@/webviews/fix-preview/types";

function createData(): FixPreviewData {
  return {
    baseLocale: "en",
    displayNameConfig: {
      framework: "vue-i18n",
      defaultNamespace: "translation",
      namespaceSeparator: "auto"
    },
    localeMap: {
      en: {
        "app.title": "Hello",
        "app.desc": "Description",
        "app.exist": "Existing"
      },
      "zh-cn": {
        "app.title": "你好",
        "app.exist": "已存在"
      }
    },
    updatePayloads: [
      {
        type: "edit",
        key: "app.title",
        valueChanges: {
          "zh-cn": { before: "你好", after: "您好" }
        }
      },
      {
        type: "fill",
        key: "app.desc",
        valueChanges: {
          "zh-cn": { after: "描述" }
        }
      },
      {
        type: "add",
        key: "app.newItem",
        valueChanges: {
          en: { after: "New item" },
          "zh-cn": { after: "新词条" }
        }
      }
    ],
    idPatches: {
      "src/demo.vue": [
        {
          id: "new-item",
          raw: 't("新词条")',
          fixedRaw: 't("app.newItem")',
          fixedName: "app.newItem",
          addedVars: "",
          pos: "0,1,0,1"
        },
        {
          id: "existing-item",
          raw: 't("已存在")',
          fixedRaw: 't("app.exist")',
          fixedName: "app.exist",
          addedVars: "",
          pos: "2,3,2,3"
        }
      ]
    }
  };
}

describe("webviews/fix-preview/model", () => {
  it("buildUnits should classify all four scenarios", () => {
    const units = buildUnits(createData());
    const map = new Map(units.map(unit => [unit.key, unit.kind]));
    assert.strictEqual(map.get("app.title"), "import-edit");
    assert.strictEqual(map.get("app.desc"), "fill-missing");
    assert.strictEqual(map.get("app.newItem"), "new-key-and-patch");
    assert.strictEqual(map.get("app.exist"), "patch-existing-key");
  });

  it("editing key should sync payload key and patch key", () => {
    const data = createData();
    const units = buildUnits(data);
    const newUnit = units.find(unit => unit.key === "app.newItem");
    if (newUnit === undefined) {
      assert.fail("newUnit not found");
    }
    newUnit.keyDraft = "app.custom.newKey";

    const exported = exportPreviewData(data, units);
    const addPayload = exported.updatePayloads.find(payload => payload.type === "add");
    assert.strictEqual(addPayload?.key, "app.custom.newKey");

    const patch = exported.idPatches["src/demo.vue"].find(item => item.id === "new-item");
    assert.strictEqual(patch?.fixedName, "app.custom.newKey");
    assert.strictEqual(patch?.fixedRaw, 't("app.custom.newKey")');
  });

  it("deselecting a unit should remove both value and patch updates", () => {
    const data = createData();
    const units = buildUnits(data);
    const newUnit = units.find(unit => unit.key === "app.newItem");
    if (newUnit === undefined) {
      assert.fail("newUnit not found");
    }
    newUnit.selected = false;

    const exported = exportPreviewData(data, units);
    assert.strictEqual(
      exported.updatePayloads.some(payload => payload.key === "app.newItem"),
      false
    );
    assert.strictEqual(
      (exported.idPatches["src/demo.vue"] ?? []).some(item => item.id === "new-item"),
      false
    );
  });

  it("deselecting one locale should keep other updates", () => {
    const data = createData();
    const units = buildUnits(data);
    const newUnit = units.find(unit => unit.key === "app.newItem");
    if (newUnit === undefined) {
      assert.fail("newUnit not found");
    }
    newUnit.values["zh-cn"].selected = false;

    const exported = exportPreviewData(data, units);
    const payload = exported.updatePayloads.find(item => item.key === "app.newItem");
    if (payload === undefined) {
      assert.fail("payload not found");
    }
    assert.strictEqual(payload.valueChanges?.["zh-cn"], undefined);
    assert.strictEqual(payload.valueChanges?.en?.after, "New item");
  });
});
