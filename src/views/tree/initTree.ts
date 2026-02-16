import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { detectI18nFramework } from "@/utils/regex";
import { detectI18nProject, getPossibleLangPaths, toAbsolutePath, toRelativePath } from "@/utils/fs";
import {
  INDENT_TYPE,
  I18N_FRAMEWORK,
  I18nFramework,
  LANGUAGE_STRUCTURE,
  LangContextPublic,
  QUOTE_STYLE_4_KEY,
  QUOTE_STYLE_4_VALUE,
  SORT_MODE
} from "@/types";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getCacheConfig, getConfig, setCacheConfig, setConfig } from "@/utils/config";

interface InitTreeParams {
  mage: LangMage;
  getPublicCtx: () => LangContextPublic;
  setPublicCtx: (ctx: LangContextPublic) => void;
  setInitialized: (initialized: boolean) => void;
  refresh: () => void;
}

export async function initTreeWithDeps(params: InitTreeParams): Promise<boolean> {
  try {
    const projectPath = toAbsolutePath(getCacheConfig<string>("workspace.projectPath", ""));
    let success = false;

    if (projectPath.trim() === "") {
      return false;
    }

    const framework = getCacheConfig<I18nFramework>("i18nFeatures.framework");
    if (framework === I18N_FRAMEWORK.auto) {
      const i18nFramework = detectI18nFramework(projectPath);
      setCacheConfig("i18nFeatures.framework", i18nFramework ?? I18N_FRAMEWORK.none);
    }

    const vscodeLang = vscode.env.language;
    params.mage.setOptions({ projectPath, defaultLang: vscodeLang });
    const configLangPath = getCacheConfig<string>("workspace.languagePath", "");
    if (configLangPath) {
      params.mage.setOptions({ langPath: toAbsolutePath(configLangPath), task: "check" });
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
        langInfo.avgFileNestedLevel === 0 && langInfo.languageStructure === LANGUAGE_STRUCTURE.flat && sortMode !== SORT_MODE.None
      );

      const publicCtx = params.mage.getPublicContext();
      params.setPublicCtx(publicCtx);
      const langPath = toRelativePath(publicCtx.langPath);

      setTimeout(() => {
        const curFramework = getConfig<I18nFramework>("i18nFeatures.framework");
        const usedFramework = getCacheConfig<I18nFramework>("i18nFeatures.framework");
        if (curFramework !== usedFramework) {
          setConfig("i18nFeatures.framework", usedFramework).catch(error => {
            NotificationManager.logToOutput(`Failed to set config for i18nFramework: ${error}`, "error");
          });
        }
        if (getCacheConfig("workspace.languagePath", "") !== langPath) {
          setConfig("workspace.languagePath", langPath).catch(error => {
            NotificationManager.logToOutput(`Failed to set config for langPath: ${error}`, "error");
          });
        }
        if (getCacheConfig("general.displayLanguage", "") === "") {
          setConfig("general.displayLanguage", vscodeLang, "global").catch(error => {
            NotificationManager.logToOutput(`Failed to set config for displayLanguage: ${error}`, "error");
          });
        }
        if (getCacheConfig("translationServices.referenceLanguage", "") === "") {
          setConfig("translationServices.referenceLanguage", vscodeLang, "global").catch(error => {
            NotificationManager.logToOutput(`Failed to set config for referenceLanguage: ${error}`, "error");
          });
        }

        const latestPublicCtx = params.getPublicCtx();
        const latestLangInfo = params.mage.langDetail;
        if (
          getCacheConfig("i18nFeatures.namespaceStrategy") !== latestPublicCtx.namespaceStrategy &&
          latestLangInfo.avgFileNestedLevel > 0
        ) {
          setConfig("i18nFeatures.namespaceStrategy", latestPublicCtx.namespaceStrategy).catch(error => {
            NotificationManager.logToOutput(`Failed to set config for namespaceStrategy: ${error}`, "error");
          });
        }

        const fileExtraData = Object.values(latestLangInfo.fileExtraInfo);
        if (fileExtraData.length === 0) return;
        if (getCacheConfig("writeRules.indentType") === INDENT_TYPE.auto) {
          const initIndentType = fileExtraData[0].indentType;
          const isUnified = fileExtraData.every(item => item.indentType === initIndentType);
          if (isUnified) {
            setConfig("writeRules.indentType", initIndentType).catch(error => {
              NotificationManager.logToOutput(`Failed to set config for indentType: ${error}`, "error");
            });
          }
        }
        if (getCacheConfig("writeRules.indentSize") === null) {
          const initIndentSize = fileExtraData[0].indentSize;
          const isUnified = fileExtraData.every(item => item.indentSize === initIndentSize);
          if (isUnified) {
            setConfig("writeRules.indentSize", initIndentSize).catch(error => {
              NotificationManager.logToOutput(`Failed to set config for indentSize: ${error}`, "error");
            });
          }
        }
        if (getCacheConfig("writeRules.quoteStyleForKey") === QUOTE_STYLE_4_KEY.auto) {
          const initKeyQuotes = fileExtraData[0].keyQuotes;
          const isUnified = fileExtraData.every(item => item.keyQuotes === initKeyQuotes);
          if (isUnified) {
            setConfig("writeRules.quoteStyleForKey", initKeyQuotes).catch(error => {
              NotificationManager.logToOutput(`Failed to set config for quoteStyleForKey: ${error}`, "error");
            });
          }
        }
        if (getCacheConfig("writeRules.quoteStyleForValue") === QUOTE_STYLE_4_VALUE.auto) {
          const initValueQuotes = fileExtraData[0].valueQuotes;
          const isUnified = fileExtraData.every(item => item.valueQuotes === initValueQuotes);
          if (isUnified) {
            setConfig("writeRules.quoteStyleForValue", initValueQuotes).catch(error => {
              NotificationManager.logToOutput(`Failed to set config for quoteStyleForValue: ${error}`, "error");
            });
          }
        }
        if (getCacheConfig("writeRules.languageStructure") === LANGUAGE_STRUCTURE.auto) {
          const isFlat = fileExtraData.every(item => item.isFlat);
          setConfig("writeRules.languageStructure", LANGUAGE_STRUCTURE[isFlat ? "flat" : "nested"]).catch(error => {
            NotificationManager.logToOutput(`Failed to set config for languageStructure: ${error}`, "error");
          });
        }
      }, 10000);
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
