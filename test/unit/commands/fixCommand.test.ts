/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import * as assert from "assert";
import mockRequire from "mock-require";
import { genIdFromText } from "@/utils/regex";
import { setConfigValue, vscodeMock } from "../../helpers/vscodeMock";

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

describe("commands/fix/fixCommand", () => {
  const vscodeAny = vscodeMock as unknown as {
    commands: { registerCommand?: unknown };
    window: { showQuickPick?: unknown; showInputBox?: unknown; withProgress?: unknown };
    Uri?: unknown;
  };
  const originalRegisterCommand = vscodeAny.commands.registerCommand;
  const originalShowQuickPick = vscodeAny.window.showQuickPick;
  const originalShowInputBox = vscodeAny.window.showInputBox;
  const originalWithProgress = vscodeAny.window.withProgress;
  const originalUri = vscodeAny.Uri;

  beforeEach(() => {
    mockRequire.stop("@/commands/fix/fixCommand");
    mockRequire.stop("@/core/LangMage");
    mockRequire.stop("@/views/tree");
    mockRequire.stop("@/views/fixWebview");
    mockRequire.stop("@/utils/wrapWithProgress");
    mockRequire.stop("@/utils/preview");
    mockRequire.stop("@/utils/notification");
    mockRequire.stop("@/ai");
    resetModule("@/commands/fix/fixCommand");
  });

  afterEach(() => {
    vscodeAny.commands.registerCommand = originalRegisterCommand;
    vscodeAny.window.showQuickPick = originalShowQuickPick;
    vscodeAny.window.showInputBox = originalShowInputBox;
    vscodeAny.window.withProgress = originalWithProgress;
    vscodeAny.Uri = originalUri;
  });

  it("query+switch 分流后的非源语言未定义词条也应触发 AI 前缀选择", async () => {
    const commandMap: Record<string, (query?: unknown) => Promise<void>> = {};
    const aiCalls: Array<{ sourceTextList: string[]; sourceFilePathList: string[][]; prefixCandidates: string[] }> = [];
    const executeCalls: Array<{ task: string; fixQuery?: { entriesToGen?: unknown; keyPrefixPatch?: Record<string, string> } }> = [];

    setConfigValue("translationServices.matchExistingKey", false);
    setConfigValue("translationServices.validateLanguageBeforeTranslate", true);
    setConfigValue("translationServices.unmatchedLanguageAction", "query");
    setConfigValue("writeRules.keyPrefix", "ai-selection");
    setConfigValue("writeRules.prefixCandidates", ["app.common"]);

    vscodeAny.commands.registerCommand = (name: string, fn: (query?: unknown) => Promise<void>) => {
      commandMap[name] = fn;
      return { dispose: () => undefined };
    };

    const quickPickQueue = ["command.fix.switch", "zh-cn"];
    vscodeAny.Uri = class MockUri {
      fsPath: string;
      constructor(fsPath: string) {
        this.fsPath = fsPath;
      }
    };
    vscodeAny.window.showQuickPick = async (items: unknown[]) => {
      const next = quickPickQueue.shift();
      if (next !== undefined) return next;
      return Array.isArray(items) && items.length > 0 ? items[0] : undefined;
    };
    vscodeAny.window.showInputBox = async () => "custom";

    const mageMock = {
      detectedLangList: ["en", "zh-cn"],
      langDetail: {
        avgFileNestedLevel: 0,
        nameSeparator: ".",
        undefined: {
          你好: {
            "src/demo.ts": new Set(["0,1,0,1"])
          }
        },
        classTree: [],
        countryMap: { en: {}, "zh-cn": {} },
        lack: {},
        null: {},
        updatePayloads: [],
        patchedIds: {}
      },
      getPublicContext: () => ({
        referredLang: "en",
        ignoredLangs: [],
        namespaceStrategy: "none",
        autoTranslateEmptyKey: false,
        sortAfterFix: false
      }),
      setOptions: () => undefined,
      execute: async (task: { task: string; fixQuery?: { entriesToGen?: unknown; keyPrefixPatch?: Record<string, string> } }) => {
        executeCalls.push(task);
        if (task.task === "check") return { success: true };
        return {
          success: true,
          code: 0,
          message: "",
          data: { success: 0, failed: 0, generated: 0, total: 0, patched: 0 }
        };
      }
    };

    mockRequire("@/core/LangMage", {
      __esModule: true,
      default: {
        getInstance: () => mageMock
      }
    });
    mockRequire("@/views/tree", {
      treeInstance: {
        isSyncing: false,
        refresh: () => undefined
      }
    });
    mockRequire("@/views/fixWebview", () => undefined);
    mockRequire("@/utils/wrapWithProgress", {
      wrapWithProgress: async (
        _opt: unknown,
        cb: (progress: { report: () => void }, token: { isCancellationRequested: boolean }) => Promise<void>
      ) => cb({ report: () => undefined }, { isCancellationRequested: false })
    });
    mockRequire("@/utils/preview", {
      PREVIEW_CHANGE_SCOPE: { fix: "fix" },
      shouldPreviewChange: () => false
    });
    mockRequire("@/utils/notification", {
      NotificationManager: {
        showProgress: () => undefined,
        showResult: async () => undefined,
        showOutputChannel: () => undefined
      }
    });
    mockRequire("@/ai", {
      selectPrefixFromAi: async (args: { sourceTextList: string[]; sourceFilePathList: string[][]; prefixCandidates: string[] }) => {
        aiCalls.push(args);
        return {
          success: true,
          data: ["app.common"]
        };
      }
    });

    const { registerFixCommand } = require("@/commands/fix/fixCommand") as typeof import("@/commands/fix/fixCommand");
    registerFixCommand({
      subscriptions: [],
      workspaceState: {
        get: () => undefined,
        update: async () => undefined
      }
    } as unknown as Parameters<typeof registerFixCommand>[0]);

    await commandMap["i18nMage.fixUndefinedEntries"]({ data: ["你好"] });

    assert.strictEqual(aiCalls.length, 1);
    assert.deepStrictEqual(aiCalls[0].sourceTextList, ["你好"]);
    assert.deepStrictEqual(aiCalls[0].prefixCandidates, ["app.common"]);
    const switchedTask = executeCalls.find(
      item => item.task === "fix" && Array.isArray(item.fixQuery?.entriesToGen) && item.fixQuery?.entriesToGen.includes("你好")
    );
    assert.ok(switchedTask);
    assert.deepStrictEqual(switchedTask?.fixQuery?.keyPrefixPatch, {
      [genIdFromText("你好")]: "app.common"
    });
  });
});
