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

function createFillOnlyData(): FixPreviewData {
  return {
    baseLocale: "zh-cn",
    displayNameConfig: {
      framework: "vue-i18n",
      defaultNamespace: "translation",
      namespaceSeparator: "auto"
    },
    localeMap: {
      en: {},
      "zh-cn": {
        "app.missing": "新增词条"
      }
    },
    updatePayloads: [
      {
        type: "fill",
        key: "app.missing",
        valueChanges: {
          en: { after: "Added entry" }
        }
      }
    ],
    idPatches: {}
  };
}

function createRenamableMultiPayloadData(): FixPreviewData {
  return {
    baseLocale: "zh-cn",
    displayNameConfig: {
      framework: "vue-i18n",
      defaultNamespace: "translation",
      namespaceSeparator: "auto"
    },
    localeMap: {
      en: {},
      "zh-cn": {
        "app.generated": "新词条"
      }
    },
    updatePayloads: [
      {
        type: "add",
        key: "app.generated",
        valueChanges: {
          "zh-cn": { after: "新词条" }
        }
      },
      {
        type: "fill",
        key: "app.generated",
        valueChanges: {
          en: { after: "Generated entry" }
        }
      }
    ],
    idPatches: {}
  };
}

function createNewEntryOnlyData(): FixPreviewData {
  return {
    baseLocale: "zh-cn",
    displayNameConfig: {
      framework: "vue-i18n",
      defaultNamespace: "translation",
      namespaceSeparator: "auto"
    },
    localeMap: {
      en: {},
      "zh-cn": {}
    },
    updatePayloads: [
      {
        type: "add",
        key: "app.createdOnly",
        valueChanges: {
          en: { after: "Created only" },
          "zh-cn": { after: "仅新增" }
        }
      }
    ],
    idPatches: {}
  };
}

function createImportEditOnlyData(): FixPreviewData {
  return {
    baseLocale: "en",
    displayNameConfig: {
      framework: "vue-i18n",
      defaultNamespace: "translation",
      namespaceSeparator: "auto"
    },
    localeMap: {
      en: {
        "app.edited": "Before"
      },
      "zh-cn": {
        "app.edited": "之前"
      }
    },
    updatePayloads: [
      {
        type: "edit",
        key: "app.edited",
        valueChanges: {
          en: { before: "Before", after: "After" }
        }
      }
    ],
    idPatches: {}
  };
}

function createPatchOnlyData(): FixPreviewData {
  return {
    baseLocale: "zh-cn",
    displayNameConfig: {
      framework: "vue-i18n",
      defaultNamespace: "translation",
      namespaceSeparator: "auto"
    },
    localeMap: {
      en: {
        "app.exists": "Exists"
      },
      "zh-cn": {
        "app.exists": "已存在"
      }
    },
    updatePayloads: [],
    idPatches: {
      "src/feature.ts": [
        {
          id: "已存在",
          raw: 't("已存在")',
          fixedRaw: 't("app.exists")',
          fixedName: "app.exists",
          addedVars: "",
          pos: "5,6,5,6"
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

  it("buildUnits should classify pure new-entry without patches", () => {
    const units = buildUnits(createNewEntryOnlyData());
    assert.strictEqual(units.length, 1);
    assert.strictEqual(units[0].kind, "new-entry");
    assert.strictEqual(units[0].keyEditable, true);
  });

  it("buildUnits should classify patch-only entry", () => {
    const units = buildUnits(createPatchOnlyData());
    assert.strictEqual(units.length, 1);
    assert.strictEqual(units[0].kind, "patch-existing-key");
    assert.strictEqual(units[0].patches.length, 1);
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
    assert.strictEqual(addPayload?.key, "app.newItem");
    assert.strictEqual(addPayload?.keyChange?.key.before, "app.newItem");
    assert.strictEqual(addPayload?.keyChange?.key.after, "app.custom.newKey");

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

  it("should not synthesize a no-op keyChange for fill-only updates", () => {
    const data = createFillOnlyData();
    const units = buildUnits(data);

    const exported = exportPreviewData(data, units);
    const fillPayload = exported.updatePayloads[0];

    assert.strictEqual(fillPayload?.type, "fill");
    assert.strictEqual(fillPayload?.key, "app.missing");
    assert.strictEqual(fillPayload?.keyChange, undefined);
    assert.strictEqual(fillPayload?.valueChanges?.en?.after, "Added entry");
  });

  it("should only attach keyChange to the primary payload when renaming a generated entry", () => {
    const data = createRenamableMultiPayloadData();
    const units = buildUnits(data);
    const generatedUnit = units.find(unit => unit.key === "app.generated");
    if (generatedUnit === undefined) {
      assert.fail("generatedUnit not found");
    }
    generatedUnit.keyDraft = "app.custom.generated";

    const exported = exportPreviewData(data, units);
    const addPayload = exported.updatePayloads.find(payload => payload.type === "add");
    const fillPayload = exported.updatePayloads.find(payload => payload.type === "fill");

    assert.strictEqual(addPayload?.key, "app.generated");
    assert.strictEqual(addPayload?.keyChange?.key.after, "app.custom.generated");
    assert.strictEqual(fillPayload?.key, "app.custom.generated");
    assert.strictEqual(fillPayload?.keyChange, undefined);
  });

  it("should preserve pure new-entry payloads without synthesizing keyChange", () => {
    const data = createNewEntryOnlyData();
    const units = buildUnits(data);

    const exported = exportPreviewData(data, units);
    const addPayload = exported.updatePayloads[0];

    assert.strictEqual(addPayload?.type, "add");
    assert.strictEqual(addPayload?.key, "app.createdOnly");
    assert.strictEqual(addPayload?.keyChange, undefined);
    assert.strictEqual(addPayload?.valueChanges?.en?.after, "Created only");
    assert.strictEqual(addPayload?.valueChanges?.["zh-cn"]?.after, "仅新增");
  });

  it("should keep import-edit payloads as value-only updates", () => {
    const data = createImportEditOnlyData();
    const units = buildUnits(data);
    units[0].values.en.after = "After revised";

    const exported = exportPreviewData(data, units);
    const editPayload = exported.updatePayloads[0];

    assert.strictEqual(editPayload?.type, "edit");
    assert.strictEqual(editPayload?.key, "app.edited");
    assert.strictEqual(editPayload?.keyChange, undefined);
    assert.strictEqual(editPayload?.valueChanges?.en?.after, "After revised");
  });

  it("should export patch-only entries and allow deselecting the patch", () => {
    const data = createPatchOnlyData();
    const units = buildUnits(data);

    const exported = exportPreviewData(data, units);
    assert.strictEqual(exported.updatePayloads.length, 0);
    assert.strictEqual(exported.idPatches["src/feature.ts"]?.length, 1);
    assert.strictEqual(exported.idPatches["src/feature.ts"]?.[0].fixedName, "app.exists");

    units[0].patches[0].selected = false;
    const deselected = exportPreviewData(data, units);
    assert.strictEqual(deselected.updatePayloads.length, 0);
    assert.strictEqual(deselected.idPatches["src/feature.ts"], undefined);
  });
});
