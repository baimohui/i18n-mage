import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { detectI18nFramework } from "@/utils/regex";
import { detectI18nProject, getPossibleLangPaths, toAbsolutePath, toRelativePath } from "@/utils/fs";
import {
  INDENT_TYPE,
  I18N_FRAMEWORK,
  I18nFramework,
  KEY_STYLE,
  LANGUAGE_STRUCTURE,
  LangContextPublic,
  QUOTE_STYLE_4_KEY,
  QUOTE_STYLE_4_VALUE,
  SORT_MODE
} from "@/types";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getCacheConfig, getConfig, setCacheConfig, setConfig } from "@/utils/config";
import { getIgnoredPathsFromConfig } from "@/utils/ignorePaths";
import { getWorkspaceRootPath, getWorkspaceScope } from "@/utils/workspace";

interface InitTreeParams {
  mage: LangMage;
  getPublicCtx: () => LangContextPublic;
  setPublicCtx: (ctx: LangContextPublic) => void;
  setInitialized: (initialized: boolean) => void;
  refresh: () => void;
}

type ConfigTargetScope = "global" | "workspace" | "workspaceFolder";

interface PendingConfigUpdate {
  key: string;
  value: unknown;
  targetScope?: ConfigTargetScope;
}

const initConfigSyncTasks = new Map<string, Promise<void>>();

async function applyConfigUpdatesInOrder(updates: PendingConfigUpdate[], scope?: vscode.ConfigurationScope) {
  for (const update of updates) {
    try {
      await setConfig(update.key, update.value, update.targetScope ?? "workspace", scope);
    } catch (error) {
      NotificationManager.logToOutput(`Failed to set config for ${update.key}: ${String(error)}`, "error");
    }
  }
}

async function runInitConfigSyncOnce(projectPath: string, updates: PendingConfigUpdate[], scope?: vscode.ConfigurationScope) {
  const existingTask = initConfigSyncTasks.get(projectPath);
  if (existingTask) {
    await existingTask;
    return;
  }

  const task = applyConfigUpdatesInOrder(updates, scope);
  initConfigSyncTasks.set(projectPath, task);
  try {
    await task;
  } finally {
    if (initConfigSyncTasks.get(projectPath) === task) {
      initConfigSyncTasks.delete(projectPath);
    }
  }
}

export async function initTreeWithDeps(params: InitTreeParams): Promise<boolean> {
  try {
    const workspaceScope = getWorkspaceScope();
    const workspaceRootPath = getWorkspaceRootPath(workspaceScope);
    const configProjectPath = toAbsolutePath(getCacheConfig<string>("workspace.projectPath", "", workspaceScope), workspaceScope);
    const projectPath = configProjectPath.trim() === "" ? workspaceRootPath : configProjectPath;
    let success = false;

    if (projectPath.trim() === "") {
      return false;
    }

    const framework = getCacheConfig<I18nFramework>("i18nFeatures.framework", undefined, workspaceScope);
    if (framework === I18N_FRAMEWORK.auto) {
      const i18nFramework = detectI18nFramework(projectPath);
      setCacheConfig("i18nFeatures.framework", i18nFramework ?? I18N_FRAMEWORK.none, workspaceScope);
    }

    const vscodeLang = vscode.env.language;
    params.mage.setOptions({ projectPath, defaultLang: vscodeLang });
    const configLangPath = getCacheConfig<string>("workspace.languagePath", "", workspaceScope);
    if (configLangPath) {
      params.mage.setOptions({ langPath: toAbsolutePath(configLangPath, workspaceScope), task: "check" });
      await params.mage.execute();
    }

    if (params.mage.detectedLangList.length === 0) {
      const possibleLangPaths = await getPossibleLangPaths(projectPath);
      for (const langPath of possibleLangPaths) {
        params.mage.setOptions({ langPath, task: "check" });
        await params.mage.execute();
        if (params.mage.detectedLangList.length > 0) {
          break;
        }
      }
      if (params.mage.detectedLangList.length > 0) {
        const publicCtx = params.mage.getPublicContext();
        params.setPublicCtx(publicCtx);
        const relativeLangPath = toRelativePath(publicCtx.langPath);
        NotificationManager.showSuccess(t("command.selectLangPath.success", relativeLangPath));
      }
    }

    if (params.mage.detectedLangList.length === 0) {
      vscode.commands.executeCommand("setContext", "i18nMage.hasValidLangPath", false);
      success = false;
      if (!(await detectI18nProject(projectPath))) {
        return false;
      }
      NotificationManager.showWarning(t("common.noLangPathDetectedWarn"), t("command.selectLangPath.title")).then(selection => {
        if (selection === t("command.selectLangPath.title")) {
          vscode.commands.executeCommand("i18nMage.selectLangPath");
        }
      });
    } else {
      vscode.commands.executeCommand("setContext", "i18nMage.hasValidLangPath", true);
      success = true;
      const sortMode = getCacheConfig<string>("writeRules.sortRule");
      const langInfo = params.mage.langDetail;
      vscode.commands.executeCommand(
        "setContext",
        "i18nMage.allowSort",
        sortMode !== SORT_MODE.None &&
          ((langInfo.avgFileNestedLevel === 0 && langInfo.languageStructure === LANGUAGE_STRUCTURE.flat) ||
            (langInfo.languageStructure === LANGUAGE_STRUCTURE.nested && sortMode === SORT_MODE.ByKey))
      );

      const publicCtx = params.mage.getPublicContext();
      params.setPublicCtx(publicCtx);
      const langPath = toRelativePath(publicCtx.langPath);

      const pendingUpdates: PendingConfigUpdate[] = [];
      const curFramework = getConfig<I18nFramework>("i18nFeatures.framework", undefined, workspaceScope);
      const usedFramework = getCacheConfig<I18nFramework>("i18nFeatures.framework", undefined, workspaceScope);
      if (curFramework !== usedFramework) {
        pendingUpdates.push({ key: "i18nFeatures.framework", value: usedFramework });
      }
      if (usedFramework === I18N_FRAMEWORK.i18nNext || usedFramework === I18N_FRAMEWORK.reactI18next) {
        const configInterpolationBrackets = getConfig<"single" | "double" | "auto">(
          "i18nFeatures.interpolationBrackets",
          "auto",
          workspaceScope
        );
        const cachedInterpolationBrackets = getCacheConfig<"single" | "double" | "auto">(
          "i18nFeatures.interpolationBrackets",
          "auto",
          workspaceScope
        );
        if (configInterpolationBrackets === "auto" && cachedInterpolationBrackets !== "auto") {
          pendingUpdates.push({ key: "i18nFeatures.interpolationBrackets", value: cachedInterpolationBrackets });
        }

        const configNamespaceSeparator = getConfig<"." | ":" | "auto">("i18nFeatures.namespaceSeparator", "auto", workspaceScope);
        const cachedNamespaceSeparator = getCacheConfig<"." | ":" | "auto">("i18nFeatures.namespaceSeparator", "auto", workspaceScope);
        if (configNamespaceSeparator === "auto" && cachedNamespaceSeparator !== "auto") {
          pendingUpdates.push({ key: "i18nFeatures.namespaceSeparator", value: cachedNamespaceSeparator });
        }

        const configDefaultNamespace = getConfig<string>("i18nFeatures.defaultNamespace", "translation", workspaceScope);
        const cachedDefaultNamespace = getCacheConfig<string>("i18nFeatures.defaultNamespace", "translation", workspaceScope);
        if (configDefaultNamespace === "translation" && cachedDefaultNamespace !== "translation") {
          pendingUpdates.push({ key: "i18nFeatures.defaultNamespace", value: cachedDefaultNamespace });
        }
      }
      if (getConfig<string>("workspace.languagePath", "", workspaceScope) !== langPath) {
        pendingUpdates.push({ key: "workspace.languagePath", value: langPath, targetScope: "workspaceFolder" });
      }
      const currentIgnoredPaths = getConfig<string[]>("workspace.ignoredPaths", [], workspaceScope) ?? [];
      const mergedIgnoredPaths = getIgnoredPathsFromConfig(workspaceScope);
      const ignoredPathsChanged =
        currentIgnoredPaths.length !== mergedIgnoredPaths.length ||
        mergedIgnoredPaths.some((item, index) => item !== currentIgnoredPaths[index]);
      if (ignoredPathsChanged) {
        pendingUpdates.push({ key: "workspace.ignoredPaths", value: mergedIgnoredPaths, targetScope: "workspaceFolder" });
        setCacheConfig("workspace.ignoredPaths", mergedIgnoredPaths, workspaceScope);
      }
      if (getConfig<string>("general.displayLanguage", "", workspaceScope) === "") {
        pendingUpdates.push({ key: "general.displayLanguage", value: vscodeLang, targetScope: "global" });
      }
      if (getConfig<string>("translationServices.referenceLanguage", "", workspaceScope) === "") {
        pendingUpdates.push({ key: "translationServices.referenceLanguage", value: vscodeLang, targetScope: "global" });
      }

      const latestPublicCtx = params.getPublicCtx();
      const latestLangInfo = params.mage.langDetail;
      if (
        getConfig("i18nFeatures.namespaceStrategy", undefined, workspaceScope) !== latestPublicCtx.namespaceStrategy &&
        latestLangInfo.avgFileNestedLevel > 0
      ) {
        pendingUpdates.push({ key: "i18nFeatures.namespaceStrategy", value: latestPublicCtx.namespaceStrategy });
      }
      if (getConfig("writeRules.keyStyle", undefined, workspaceScope) === KEY_STYLE.auto) {
        pendingUpdates.push({ key: "writeRules.keyStyle", value: latestPublicCtx.keyStyle });
      }

      const fileExtraData = Object.values(latestLangInfo.fileExtraInfo);
      if (fileExtraData.length > 0) {
        if (getConfig("writeRules.indentType", undefined, workspaceScope) === INDENT_TYPE.auto) {
          const initIndentType = fileExtraData[0].indentType;
          const isUnified = fileExtraData.every(item => item.indentType === initIndentType);
          if (isUnified) {
            pendingUpdates.push({ key: "writeRules.indentType", value: initIndentType });
          }
        }
        if (getConfig("writeRules.indentSize", undefined, workspaceScope) === null) {
          const initIndentSize = fileExtraData[0].indentSize;
          const isUnified = fileExtraData.every(item => item.indentSize === initIndentSize);
          if (isUnified) {
            pendingUpdates.push({ key: "writeRules.indentSize", value: initIndentSize });
          }
        }
        if (getConfig("writeRules.quoteStyleForKey", undefined, workspaceScope) === QUOTE_STYLE_4_KEY.auto) {
          const initKeyQuotes = fileExtraData[0].keyQuotes;
          const isUnified = fileExtraData.every(item => item.keyQuotes === initKeyQuotes);
          if (isUnified) {
            pendingUpdates.push({ key: "writeRules.quoteStyleForKey", value: initKeyQuotes });
          }
        }
        if (getConfig("writeRules.quoteStyleForValue", undefined, workspaceScope) === QUOTE_STYLE_4_VALUE.auto) {
          const initValueQuotes = fileExtraData[0].valueQuotes;
          const isUnified = fileExtraData.every(item => item.valueQuotes === initValueQuotes);
          if (isUnified) {
            pendingUpdates.push({ key: "writeRules.quoteStyleForValue", value: initValueQuotes });
          }
        }
        if (getConfig("writeRules.languageStructure", undefined, workspaceScope) === LANGUAGE_STRUCTURE.auto) {
          const isFlat = fileExtraData.every(item => item.isFlat);
          pendingUpdates.push({ key: "writeRules.languageStructure", value: LANGUAGE_STRUCTURE[isFlat ? "flat" : "nested"] });
        }
      }

      await runInitConfigSyncOnce(projectPath, pendingUpdates, workspaceScope);
    }

    params.setInitialized(true);
    params.refresh();
    vscode.commands.executeCommand("setContext", "i18nMage.initialized", true);
    return success;
  } catch (e: unknown) {
    const errorMessage = t("tree.init.error", e instanceof Error ? e.message : (e as string));
    NotificationManager.showError(errorMessage);
    return false;
  }
}
