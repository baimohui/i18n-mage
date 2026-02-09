type ConfigValue = unknown;

const configStore = new Map<string, ConfigValue>();
const filesConfigStore = new Map<string, ConfigValue>();
const updateCalls: { key: string; value: ConfigValue; target: number; scope?: unknown }[] = [];
let activeEditorText: string | null = null;
let activeEditorEol: number | null = null;
let workspaceRoot: string | null = null;

export function resetConfigStore() {
  configStore.clear();
  filesConfigStore.clear();
  updateCalls.length = 0;
  activeEditorText = null;
  activeEditorEol = null;
  workspaceRoot = null;
}

export function seedDefaultConfig() {
  // 默认值用于已有单测与工具函数
  configStore.set("translationServices.langAliasCustomMappings", {
    "zh-cn": ["custom-cn", "my-zh"]
  });
  configStore.set("writeRules.enableKeyTagRule", true);
  configStore.set("writeRules.enablePrefixTagRule", true);
  configStore.set("i18nFeatures.defaultNamespace", "translation");
  configStore.set("i18nFeatures.namespaceSeparator", "auto");
}

export function setConfigValue(key: string, value: ConfigValue) {
  configStore.set(key, value);
}

export function setFilesConfigValue(key: string, value: ConfigValue) {
  filesConfigStore.set(key, value);
}

export function setActiveEditor(text: string, eol: number) {
  activeEditorText = text;
  activeEditorEol = eol;
}

export function clearActiveEditor() {
  activeEditorText = null;
  activeEditorEol = null;
}

export function setWorkspaceRoot(root: string) {
  workspaceRoot = root;
}

export function getUpdateCalls() {
  return [...updateCalls];
}

export const vscodeMock = {
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  },
  EndOfLine: {
    LF: 1,
    CRLF: 2
  },
  env: {
    language: "en"
  },
  workspace: {
    getConfiguration: (namespace: string, _scope?: unknown) => ({
      get: (key: string, defaultValue?: ConfigValue) => {
        if (namespace === "files") {
          if (filesConfigStore.has(key)) return filesConfigStore.get(key);
          return defaultValue;
        }
        if (configStore.has(key)) return configStore.get(key);
        return defaultValue;
      },
      update: (key: string, value: ConfigValue, target: number) => {
        updateCalls.push({ key, value, target });
        if (namespace === "files") {
          filesConfigStore.set(key, value);
        } else {
          configStore.set(key, value);
        }
      }
    }),
    get workspaceFolders() {
      if (workspaceRoot === null || workspaceRoot === "") return undefined;
      return [{ uri: { fsPath: workspaceRoot } }];
    },
    onDidChangeConfiguration: () => ({
      dispose: () => undefined
    })
  },
  l10n: {
    t: (key: string, ...args: string[]) => {
      if (args.length) {
        return key.replace(/\{(\d+)\}/g, (_, i: number) => args[i]);
      }
      return key;
    }
  },
  commands: {
    executeCommand: () => undefined
  },
  window: {
    registerTreeDataProvider: () => ({ dispose: () => undefined }),
    createOutputChannel: () => ({
      appendLine: () => undefined,
      show: () => undefined
    }),
    showInformationMessage: () => undefined,
    showErrorMessage: () => undefined,
    showWarningMessage: () => undefined,
    setStatusBarMessage: () => undefined,
    get activeTextEditor() {
      if (activeEditorText === null || activeEditorEol === null) return undefined;
      return {
        document: {
          eol: activeEditorEol,
          getText: () => activeEditorText
        }
      };
    }
  },
  languages: {
    registerHoverProvider: () => ({ dispose: () => undefined }),
    registerCompletionItemProvider: () => ({ dispose: () => undefined }),
    registerCodeActionsProvider: () => ({ dispose: () => undefined }),
    registerRenameProvider: () => ({ dispose: () => undefined }),
    registerDefinitionProvider: () => ({ dispose: () => undefined }),
    registerReferenceProvider: () => ({ dispose: () => undefined })
  }
};
