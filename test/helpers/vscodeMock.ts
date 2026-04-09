import path from "path";

type ConfigValue = unknown;

const configStore = new Map<string, ConfigValue>();
const filesConfigStore = new Map<string, ConfigValue>();
const updateCalls: { key: string; value: ConfigValue; target: number; scope?: unknown }[] = [];
let activeEditorText: string | null = null;
let activeEditorEol: number | null = null;
let activeEditorPath: string | null = null;
let workspaceRoots: string[] = [];

function normalizePathForCompare(targetPath: string): string {
  const normalizedPath = path.normalize(path.resolve(targetPath));
  return process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
}

function resolveWorkspaceFolder(filePath: string) {
  const normalizedTarget = normalizePathForCompare(filePath);
  let matchedRoot = "";
  for (const root of workspaceRoots) {
    const normalizedRoot = normalizePathForCompare(root);
    const isSame = normalizedTarget === normalizedRoot;
    const isChild = normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
    if ((isSame || isChild) && normalizedRoot.length > matchedRoot.length) {
      matchedRoot = root;
    }
  }
  if (!matchedRoot) return undefined;
  return { uri: { scheme: "file", fsPath: matchedRoot } };
}

export function resetConfigStore() {
  configStore.clear();
  filesConfigStore.clear();
  updateCalls.length = 0;
  activeEditorText = null;
  activeEditorEol = null;
  activeEditorPath = null;
  workspaceRoots = [];
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

export function setActiveEditor(text: string, eol: number, filePath?: string) {
  activeEditorText = text;
  activeEditorEol = eol;
  activeEditorPath = filePath ?? null;
}

export function clearActiveEditor() {
  activeEditorText = null;
  activeEditorEol = null;
  activeEditorPath = null;
}

export function setWorkspaceRoot(root: string) {
  workspaceRoots = [root];
}

export function setWorkspaceRoots(roots: string[]) {
  workspaceRoots = [...roots];
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
      if (workspaceRoots.length === 0) return undefined;
      return workspaceRoots.map(root => ({ uri: { scheme: "file", fsPath: root } }));
    },
    getWorkspaceFolder: (uri: { fsPath?: string }) => {
      const fsPath = uri?.fsPath;
      if (typeof fsPath !== "string" || fsPath.trim() === "") return undefined;
      return resolveWorkspaceFolder(fsPath);
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
      const filePath = activeEditorPath ?? workspaceRoots[0];
      return {
        document: {
          uri: { scheme: "file", fsPath: filePath ?? "" },
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
