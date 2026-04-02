/* eslint-disable @typescript-eslint/no-require-imports */
import * as assert from "assert";
import mockRequire from "mock-require";
import type { ExtensionContext } from "vscode";
import { vscodeMock } from "../../helpers/vscodeMock";
import { I18nUpdatePayload } from "@/types";
import { EntryIdPatches } from "@/webviews/fix-preview/types";

function resetModule(modulePath: string) {
  try {
    const resolved = require.resolve(modulePath);
    if (require.cache[resolved]) {
      delete require.cache[resolved];
    }
  } catch {
    // ignore
  }
}

type ReceiveMessage = (message: {
  type: "apply" | "cancel";
  data: {
    updatePayloads: I18nUpdatePayload[];
    idPatches: EntryIdPatches;
  };
}) => Promise<void>;

interface MockDisposable {
  dispose: () => void;
}

interface MockWebviewPanel {
  webview: {
    html: string;
    cspSource: string;
    asWebviewUri: (uri: { fsPath?: string }) => { toString: () => string };
    onDidReceiveMessage: (cb: ReceiveMessage) => MockDisposable;
  };
  iconPath: unknown;
  dispose: () => void;
  onDidDispose: (cb: () => void) => MockDisposable;
  reveal: (column: unknown) => void;
}

interface MutableVSCodeMock {
  Uri: {
    file: (fsPath: string) => { fsPath: string };
  };
  ViewColumn: {
    One: number;
  };
  window: typeof vscodeMock.window & {
    createWebviewPanel: () => MockWebviewPanel;
  };
}

const mutableVSCodeMock = vscodeMock as unknown as MutableVSCodeMock;

function createExtensionContext(): ExtensionContext {
  return {
    extensionPath: "D:/Projects/i18n-mage"
  } as ExtensionContext;
}

function setupWebviewPanelMock() {
  let onReceiveMessage: ReceiveMessage | undefined;
  let onDispose: (() => void) | undefined;
  let disposed = false;
  let revealedColumn: unknown;

  const panel: MockWebviewPanel = {
    webview: {
      html: "",
      cspSource: "vscode-test-resource",
      asWebviewUri: (uri: { fsPath?: string }) => ({
        toString: () => uri.fsPath ?? ""
      }),
      onDidReceiveMessage: (cb: ReceiveMessage) => {
        onReceiveMessage = cb;
        return { dispose: () => undefined };
      }
    },
    iconPath: undefined as unknown,
    dispose: () => {
      disposed = true;
      onDispose?.();
    },
    onDidDispose: (cb: () => void) => {
      onDispose = cb;
      return { dispose: () => undefined };
    },
    reveal: (column: unknown) => {
      revealedColumn = column;
    }
  };

  mutableVSCodeMock.Uri = {
    file: (fsPath: string) => ({ fsPath })
  };
  mutableVSCodeMock.ViewColumn = {
    One: 1
  };
  mutableVSCodeMock.window.createWebviewPanel = () => panel;

  return {
    panel,
    get disposed() {
      return disposed;
    },
    get revealedColumn() {
      return revealedColumn;
    },
    async emitMessage(message: Parameters<ReceiveMessage>[0]) {
      if (!onReceiveMessage) {
        assert.fail("onDidReceiveMessage callback was not registered");
      }
      await onReceiveMessage(message);
    }
  };
}

describe("views/fixWebview", function () {
  this.timeout(10000);

  beforeEach(() => {
    mockRequire.stop("@/utils/regex");
    resetModule("@/views/fixWebview");
  });

  afterEach(() => {
    mockRequire.stop("@/utils/regex");
    resetModule("@/views/fixWebview");
  });

  it("apply should replace pending updates and patches, then call onComplete", async () => {
    const panelState = setupWebviewPanelMock();
    const fixWebviewModule = require("@/views/fixWebview") as { default: typeof import("@/views/fixWebview").default };
    const launchFixWebview = fixWebviewModule.default;

    const originalUpdates: I18nUpdatePayload[] = [
      {
        type: "edit",
        key: "app.old",
        valueChanges: {
          en: { after: "Old value" }
        }
      }
    ];
    const originalPatches: EntryIdPatches = {
      "src/old.ts": [
        {
          id: "app.old",
          raw: 't("old")',
          fixedRaw: 't("app.old")',
          fixedName: "app.old",
          addedVars: "",
          pos: "1,2,1,2"
        }
      ]
    };
    const nextUpdates: I18nUpdatePayload[] = [
      {
        type: "edit",
        key: "app.new",
        valueChanges: {
          en: { after: "New value" }
        }
      }
    ];
    const nextPatches: EntryIdPatches = {
      "src/new.ts": [
        {
          id: "app.new",
          raw: 't("new")',
          fixedRaw: 't("app.new")',
          fixedName: "app.new",
          addedVars: "",
          pos: "3,4,3,4"
        }
      ]
    };
    let completeCalled = 0;
    let cancelCalled = 0;

    launchFixWebview(
      createExtensionContext(),
      originalUpdates,
      originalPatches,
      { en: {}, "zh-cn": {} },
      "zh-cn",
      () => {
        completeCalled++;
        return Promise.resolve();
      },
      () => {
        cancelCalled++;
        return Promise.resolve();
      }
    );

    assert.strictEqual(panelState.revealedColumn, 1);

    await panelState.emitMessage({
      type: "apply",
      data: {
        updatePayloads: nextUpdates,
        idPatches: nextPatches
      }
    });

    assert.strictEqual(panelState.disposed, true);
    assert.strictEqual(completeCalled, 1);
    assert.strictEqual(cancelCalled, 0);
    assert.deepStrictEqual(originalUpdates, nextUpdates);
    assert.deepStrictEqual(originalPatches, nextPatches);
  });

  it("cancel should clear pending updates and patches, then call onCancel", async () => {
    const panelState = setupWebviewPanelMock();
    const fixWebviewModule = require("@/views/fixWebview") as { default: typeof import("@/views/fixWebview").default };
    const launchFixWebview = fixWebviewModule.default;

    const originalUpdates: I18nUpdatePayload[] = [
      {
        type: "fill",
        key: "app.missing",
        valueChanges: {
          en: { after: "Filled value" }
        }
      }
    ];
    const originalPatches: EntryIdPatches = {
      "src/demo.ts": [
        {
          id: "app.missing",
          raw: 't("missing")',
          fixedRaw: 't("app.missing")',
          fixedName: "app.missing",
          addedVars: "",
          pos: "1,2,1,2"
        }
      ]
    };
    let completeCalled = 0;
    let cancelCalled = 0;

    launchFixWebview(
      createExtensionContext(),
      originalUpdates,
      originalPatches,
      { en: {}, "zh-cn": {} },
      "zh-cn",
      () => {
        completeCalled++;
        return Promise.resolve();
      },
      () => {
        cancelCalled++;
        return Promise.resolve();
      }
    );

    await panelState.emitMessage({
      type: "cancel",
      data: {
        updatePayloads: [],
        idPatches: {}
      }
    });

    assert.strictEqual(completeCalled, 0);
    assert.strictEqual(cancelCalled, 1);
    assert.deepStrictEqual(originalUpdates, []);
    assert.deepStrictEqual(originalPatches, {});
  });

  it("disposing without handling should clear preview data and trigger onCancel once", () => {
    const panelState = setupWebviewPanelMock();
    const fixWebviewModule = require("@/views/fixWebview") as { default: typeof import("@/views/fixWebview").default };
    const launchFixWebview = fixWebviewModule.default;

    const originalUpdates: I18nUpdatePayload[] = [
      {
        type: "add",
        key: "app.newEntry",
        valueChanges: {
          en: { after: "Brand new" }
        }
      }
    ];
    const originalPatches: EntryIdPatches = {
      "src/dispose.ts": [
        {
          id: "app.newEntry",
          raw: 't("brand new")',
          fixedRaw: 't("app.newEntry")',
          fixedName: "app.newEntry",
          addedVars: "",
          pos: "2,3,2,3"
        }
      ]
    };
    let cancelCalled = 0;

    launchFixWebview(
      createExtensionContext(),
      originalUpdates,
      originalPatches,
      { en: {}, "zh-cn": {} },
      "zh-cn",
      () => Promise.resolve(),
      () => {
        cancelCalled++;
        return Promise.resolve();
      }
    );

    panelState.panel.dispose();

    assert.strictEqual(cancelCalled, 1);
    assert.deepStrictEqual(originalUpdates, []);
    assert.deepStrictEqual(originalPatches, {});
  });
});
