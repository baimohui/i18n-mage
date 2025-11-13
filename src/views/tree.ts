import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import {
  unescapeString,
  getValueByAmbiguousEntryName,
  detectI18nFramework,
  internalToDisplayName,
  escapeMarkdown,
  validateLang,
  isEnglishVariable
} from "@/utils/regex";
import { detectI18nProject, getPossibleLangPaths, toAbsolutePath, toRelativePath } from "@/utils/fs";
import { getLangCode, getLangText } from "@/utils/langKey";
import {
  LangContextPublic,
  TEntry,
  LangTree,
  SORT_MODE,
  I18N_FRAMEWORK,
  UNMATCHED_LANGUAGE_ACTION,
  UnmatchedLanguageAction,
  INDENT_TYPE,
  I18nFramework,
  LANGUAGE_STRUCTURE
} from "@/types";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getCacheConfig, getConfig, setCacheConfig, setConfig } from "@/utils/config";
import { DecoratorController } from "@/features/Decorator";
import { Diagnostics } from "@/features/Diagnostics";
import { StatusBarItemManager } from "@/features/StatusBarItemManager";
import { ActiveEditorState } from "@/utils/activeEditorState";

interface ExtendedTreeItem extends vscode.TreeItem {
  level?: number;
  root?: string;
  type?: string;
  name?: string;
  key?: string;
  data?: string[];
  meta?: { scope: string };
  stack?: string[];
}

class FileItem extends vscode.TreeItem {
  constructor(resourceUri: vscode.Uri, range: vscode.Range) {
    super(resourceUri, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "fileItem";
    this.tooltip = `${resourceUri.fsPath}`;
    this.description = `${range.start.line + 1}:${range.start.character + 1}`;
    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [resourceUri, { selection: range }]
    };
  }
}

class TreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  #mage: LangMage;
  publicCtx: LangContextPublic;
  isInitialized = false;
  isSyncing: boolean | string[] = false;
  displayLang = "";
  validateLanguageBeforeTranslate = true;
  autoTranslateMissingKey = false;
  ignorePossibleVariables = true;
  unmatchedLanguageAction: UnmatchedLanguageAction = UNMATCHED_LANGUAGE_ACTION.ignore;
  usedEntries: TEntry[] = [];
  definedEntriesInCurrentFile: TEntry[] = [];
  undefinedEntriesInCurrentFile: TEntry[] = [];
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor() {
    this.#mage = LangMage.getInstance();
    this.publicCtx = this.#mage.getPublicContext();
  }

  get langInfo() {
    return this.#mage.langDetail;
  }

  get dictionary() {
    return this.langInfo.dictionary;
  }

  get countryMap() {
    return this.langInfo.countryMap;
  }

  get tree() {
    return this.langInfo.tree;
  }

  get usedEntryMap() {
    return this.langInfo.used ?? {};
  }

  get undefinedEntryMap() {
    return this.langInfo.undefined ?? {};
  }

  get usedKeySet() {
    return this.langInfo.usedKeySet;
  }

  get unusedKeySet() {
    return this.langInfo.unusedKeySet;
  }

  refresh(): void {
    this.publicCtx = this.#mage.getPublicContext();
    this.validateLanguageBeforeTranslate = getCacheConfig<boolean>("translationServices.validateLanguageBeforeTranslate", true);
    this.autoTranslateMissingKey = getCacheConfig<boolean>("translationServices.autoTranslateMissingKey", false);
    this.ignorePossibleVariables = getCacheConfig<boolean>("translationServices.ignorePossibleVariables", true);
    if (this.validateLanguageBeforeTranslate) {
      this.unmatchedLanguageAction = getCacheConfig<UnmatchedLanguageAction>("translationServices.unmatchedLanguageAction");
    }
    const resolveLang = (target: string) => {
      const targetCode = getLangCode(target);
      const defaultCode = getLangCode(this.publicCtx.defaultLang);
      return (
        this.#mage.detectedLangList.find(lang => lang === target) ??
        this.#mage.detectedLangList.find(lang => getLangCode(lang) === targetCode) ??
        this.#mage.detectedLangList.find(lang => getLangCode(lang) === defaultCode) ??
        this.#mage.detectedLangList.find(lang => getLangCode(lang) === "en") ??
        this.#mage.detectedLangList[0]
      );
    };
    this.displayLang = resolveLang(getCacheConfig<string>("general.displayLanguage"));
    this.definedEntriesInCurrentFile = [];
    this.undefinedEntriesInCurrentFile = [];
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      ActiveEditorState.update(editor);
      const definedEntries = Array.from(ActiveEditorState.definedEntries.values()).map(item => item[0]);
      for (const entry of definedEntries) {
        if (entry.dynamic) {
          const matchKeys = ActiveEditorState.dynamicMatchInfo.get(entry.nameInfo.name) || [];
          matchKeys.forEach(key => {
            if (!this.definedEntriesInCurrentFile.find(item => item.nameInfo.name === key)) {
              const newEntry = { ...entry, nameInfo: { ...entry.nameInfo, text: key, name: key, id: key } };
              this.definedEntriesInCurrentFile.push(newEntry);
            }
          });
        } else {
          this.definedEntriesInCurrentFile.push(entry);
        }
      }
      this.undefinedEntriesInCurrentFile = Array.from(ActiveEditorState.undefinedEntries.values()).map(item => item[0]);
      const decorator = DecoratorController.getInstance();
      decorator.update(editor);
      const diagnostics = Diagnostics.getInstance();
      diagnostics.update(editor.document);
      // vscode.workspace.textDocuments.forEach(doc => diagnostics.update(doc));
    }
    const statusBarItemManager = StatusBarItemManager.getInstance();
    statusBarItemManager.update();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ExtendedTreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    try {
      if (!this.publicCtx.langPath) {
        return [];
      }
      if (!element) {
        return this.getRootChildren();
      }
      switch (element.root) {
        case "CURRENT_FILE":
          return this.getCurrentFileChildren(element);
        case "SYNC_INFO":
          return this.getSyncInfoChildren(element);
        case "USAGE_INFO":
          return this.getUsageInfoChildren(element);
        case "DICTIONARY":
          return this.getDictionaryChildren(element);
        default:
          return [];
      }
    } catch (e: unknown) {
      const errorMessage = t("tree.getChildren.error", e instanceof Error ? e.message : (e as string));
      NotificationManager.showError(errorMessage);
      return [];
    }
  }

  async initTree(): Promise<boolean> {
    try {
      const projectPath = toAbsolutePath(getCacheConfig<string>("workspace.projectPath", ""));
      // const workspaceFolders = vscode.workspace.workspaceFolders;
      // if (workspaceFolders !== undefined && workspaceFolders.length > 0) {
      //   projectPath = workspaceFolders[0].uri.fsPath;
      // }
      let success = false;

      if (projectPath.trim() === "") {
        // NotificationManager.showWarning(t("common.noWorkspaceWarn"));
        return false;
      } else {
        const framework = getCacheConfig<I18nFramework>("i18nFeatures.framework");
        if (framework === I18N_FRAMEWORK.auto) {
          const i18nFramework = detectI18nFramework(projectPath);
          setCacheConfig("i18nFeatures.framework", i18nFramework ?? I18N_FRAMEWORK.none);
        }
        const vscodeLang = vscode.env.language;
        this.#mage.setOptions({ projectPath, defaultLang: vscodeLang });
        const configLangPath = getCacheConfig<string>("workspace.languagePath", "");
        if (configLangPath) {
          this.#mage.setOptions({ langPath: toAbsolutePath(configLangPath), task: "check" });
          await this.#mage.execute();
        }
        if (this.#mage.detectedLangList.length === 0) {
          const possibleLangPaths = await getPossibleLangPaths(projectPath);
          for (const langPath of possibleLangPaths) {
            this.#mage.setOptions({ langPath, task: "check" });
            await this.#mage.execute();
            if (this.#mage.detectedLangList.length > 0) {
              break;
            }
          }
          if (this.#mage.detectedLangList.length > 0) {
            this.publicCtx = this.#mage.getPublicContext();
            const relativeLangPath = toRelativePath(this.publicCtx.langPath);
            NotificationManager.showSuccess(t("command.selectLangPath.success", relativeLangPath));
          }
        }
        if (this.#mage.detectedLangList.length === 0) {
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
          vscode.commands.executeCommand(
            "setContext",
            "i18nMage.allowSort",
            this.langInfo.multiFileMode !== 0 && this.langInfo.languageStructure === LANGUAGE_STRUCTURE.flat && sortMode !== SORT_MODE.None
          );
          this.publicCtx = this.#mage.getPublicContext();
          const langPath = toRelativePath(this.publicCtx.langPath);
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
            if (getCacheConfig("i18nFeatures.namespaceStrategy") !== this.publicCtx.namespaceStrategy && this.langInfo.multiFileMode > 0) {
              setConfig("i18nFeatures.namespaceStrategy", this.publicCtx.namespaceStrategy).catch(error => {
                NotificationManager.logToOutput(`Failed to set config for namespaceStrategy: ${error}`, "error");
              });
            }
            const fileExtraData = Object.values(this.langInfo.fileExtraInfo);
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
            if (getCacheConfig("i18nFeatures.languageStructure") === LANGUAGE_STRUCTURE.auto) {
              const isFlat = fileExtraData.every(item => item.isFlat);
              setConfig("i18nFeatures.languageStructure", LANGUAGE_STRUCTURE[isFlat ? "flat" : "nested"]).catch(error => {
                NotificationManager.logToOutput(`Failed to set config for languageStructure: ${error}`, "error");
              });
            }
          }, 10000);
        }
      }
      this.isInitialized = true;
      this.refresh();
      vscode.commands.executeCommand("setContext", "i18nMage.initialized", true);
      return success;
    } catch (e: unknown) {
      const errorMessage = t("tree.init.error", e instanceof Error ? e.message : (e as string));
      NotificationManager.showError(errorMessage);
      return false;
    }
  }

  private getRootChildren(): ExtendedTreeItem[] {
    return [
      {
        level: 0,
        label: t("tree.currentFile.title"),
        id: "CURRENT_FILE",
        root: "CURRENT_FILE",
        iconPath: new vscode.ThemeIcon("file"),
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        description: String(this.definedEntriesInCurrentFile.length + this.undefinedEntriesInCurrentFile.length)
      },
      {
        level: 0,
        label: t("tree.syncInfo.title"),
        id: "SYNC_INFO",
        root: "SYNC_INFO",
        tooltip: toRelativePath(this.publicCtx.langPath),
        iconPath: new vscode.ThemeIcon(this.isSyncing !== false ? "sync~spin" : "sync"),
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        description: this.getSyncPercent()
      },
      {
        level: 0,
        label: t("tree.usedInfo.title"),
        id: "USAGE_INFO",
        root: "USAGE_INFO",
        contextValue: "checkUsage",
        iconPath: new vscode.ThemeIcon("graph"),
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        description: this.getUsagePercent()
      },
      {
        level: 0,
        label: t("tree.dictionary.title"),
        id: "DICTIONARY",
        root: "DICTIONARY",
        iconPath: new vscode.ThemeIcon("notebook"),
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        description: String(Object.keys(this.langInfo.dictionary).length)
      }
    ];
  }

  private getCurrentFileChildren(element: ExtendedTreeItem): ExtendedTreeItem[] {
    if (element.level === 0) {
      const definedContextValueList = ["definedEntriesInCurFile"];
      if (this.definedEntriesInCurrentFile.length > 0) {
        definedContextValueList.push("COPY_KEY_VALUE_LIST");
      }
      let undefinedTooltip = "";
      let undefinedDescription = String(this.undefinedEntriesInCurrentFile.length);
      const undefinedContextValueList = ["undefinedEntriesInCurFile"];
      if (this.undefinedEntriesInCurrentFile.length > 0) {
        undefinedContextValueList.push("IGNORE_UNDEFINED");
        const fixableNum = this.undefinedEntriesInCurrentFile.filter(item => {
          if (
            this.validateLanguageBeforeTranslate &&
            !validateLang(item.nameInfo.text, this.publicCtx.referredLang) &&
            this.unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.ignore
          ) {
            return false;
          }
          if (this.ignorePossibleVariables && isEnglishVariable(item.nameInfo.text)) return false;
          return true;
        }).length;
        undefinedDescription = `${this.undefinedEntriesInCurrentFile.length}(${fixableNum})`;
        undefinedTooltip = t(`tree.undefinedInfo.tooltip`, this.undefinedEntriesInCurrentFile.length, fixableNum);
        if (fixableNum > 0) {
          undefinedContextValueList.push("GEN_KEY");
        }
      }
      return [
        {
          label: t("tree.currentFile.defined"),
          description: String(this.definedEntriesInCurrentFile.length),
          collapsibleState: vscode.TreeItemCollapsibleState[this.definedEntriesInCurrentFile.length === 0 ? "None" : "Collapsed"],
          contextValue: definedContextValueList.join(","),
          level: 1,
          type: "defined",
          id: this.genId(element, "defined"),
          root: element.root
        },
        {
          label: t("tree.currentFile.undefined"),
          contextValue: undefinedContextValueList.join(","),
          data: this.undefinedEntriesInCurrentFile.map(item => item.nameInfo.text),
          meta: { scope: vscode.window.activeTextEditor?.document.uri.fsPath ?? "" },
          tooltip: undefinedTooltip,
          description: undefinedDescription,
          collapsibleState: vscode.TreeItemCollapsibleState[this.undefinedEntriesInCurrentFile.length === 0 ? "None" : "Collapsed"],
          level: 1,
          type: "undefined",
          id: this.genId(element, "undefined"),
          root: element.root
        }
      ];
    } else if (element.level === 1) {
      return this[element.type === "defined" ? "definedEntriesInCurrentFile" : "undefinedEntriesInCurrentFile"].map(entry => {
        const entryInfo = this.dictionary[getValueByAmbiguousEntryName(this.tree, entry.nameInfo.name) as string]?.value ?? {};
        const contextValueList = ["COPY_NAME"];
        let description = "";
        if (element.type === "defined") {
          contextValueList.push("definedEntryInCurFile");
          description = entryInfo[this.displayLang] ?? "";
        } else {
          contextValueList.push("undefinedEntryInCurFile", "IGNORE_UNDEFINED");
          if (this.autoTranslateMissingKey) {
            if (this.ignorePossibleVariables && isEnglishVariable(entry.nameInfo.text)) {
              description = t("tree.usedInfo.undefinedPossibleVariable");
            } else if (this.validateLanguageBeforeTranslate && !validateLang(entry.nameInfo.text, this.publicCtx.referredLang)) {
              description = t("tree.usedInfo.undefinedNoSourceLang");
              if (this.unmatchedLanguageAction !== UNMATCHED_LANGUAGE_ACTION.ignore) {
                contextValueList.push("GEN_KEY");
              }
            } else {
              contextValueList.push("GEN_KEY");
            }
          }
        }
        return {
          name: entry.nameInfo.name,
          label: internalToDisplayName(entry.nameInfo.text),
          description,
          collapsibleState: vscode.TreeItemCollapsibleState[element.type === "defined" ? "Collapsed" : "None"],
          level: 2,
          data: [entry.nameInfo.text],
          meta: { scope: vscode.window.activeTextEditor?.document.uri.fsPath ?? "" },
          contextValue: contextValueList.join(","),
          usedInfo: this[element.type === "defined" ? "usedEntryMap" : "undefinedEntryMap"][entry.nameInfo.name],
          id: this.genId(element, entry.nameInfo.name || ""),
          root: element.root
        };
      });
    } else if (element.level === 2) {
      const entryKey = getValueByAmbiguousEntryName(this.tree, element.name as string) ?? "";
      const entryInfo = this.dictionary[entryKey].value;
      return this.langInfo.langList
        .filter(lang => !this.publicCtx.ignoredLangs.includes(lang))
        .map(lang => {
          const contextValueList = ["entryTranslationInCurFile", "EDIT_VALUE"];
          if (entryInfo[lang]) {
            contextValueList.push("COPY_VALUE");
          } else if (entryInfo[this.publicCtx.referredLang]) {
            contextValueList.push("FILL_VALUE");
          }
          if (entryInfo[lang] !== undefined) {
            contextValueList.push("GO_TO_DEFINITION");
          }
          if (!getLangText(lang)) {
            contextValueList.push("UNKNOWN_LANG");
          }
          return {
            label: lang,
            name: element.name as string,
            description: entryInfo[lang] ?? false,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            level: 3,
            key: entryKey,
            data: [entryKey],
            meta: { scope: lang },
            contextValue: contextValueList.join(","),
            id: this.genId(element, lang),
            tooltip: getLangText(lang) || t("common.unknownLang")
          };
        });
    }
    return [];
  }

  private getSyncInfoChildren(element: ExtendedTreeItem): ExtendedTreeItem[] {
    if (element.level === 0) {
      return this.langInfo.langList.map(lang => {
        const { desc, icon, context, tooltip, data } = this.checkLangSyncInfo(lang);
        return {
          level: 1,
          key: lang,
          label: lang,
          root: element.root,
          tooltip,
          data,
          meta: { scope: lang },
          id: this.genId(element, lang),
          contextValue: context,
          description: desc,
          iconPath: new vscode.ThemeIcon(icon),
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        };
      });
    } else if (element.level === 1) {
      return this.getSyncInfo(element.key as string).map(item => ({
        ...item,
        level: 2,
        key: element.key,
        root: element.root,
        meta: element.meta,
        id: this.genId(element, item.type),
        description: String(item.num),
        collapsibleState: vscode.TreeItemCollapsibleState[item.num === 0 ? "None" : item.type === "common" ? "Collapsed" : "Expanded"]
      }));
    } else if (element.level === 2) {
      return (element.data as string[]).map(key => {
        const contextValueList = ["syncInfoItem", "EDIT_VALUE"];
        if (element.type !== "lack") {
          contextValueList.push("GO_TO_DEFINITION");
        }
        const tooltip = new vscode.MarkdownString();
        const definedInfo = this.dictionary[key].value;
        if (element.type === "lack" || element.type === "null") {
          Object.entries(definedInfo).forEach(([lang, value]) => {
            const args = encodeURIComponent(JSON.stringify({ description: value }));
            if (value) {
              if (lang === this.publicCtx.referredLang) {
                contextValueList.push("FILL_VALUE");
              }
              tooltip.appendMarkdown(`- **${escapeMarkdown(lang)}:** ${escapeMarkdown(value)} [📋](command:i18nMage.copyValue?${args})\n`);
            } else {
              tooltip.appendMarkdown(`- **${escapeMarkdown(lang)}:** ${t("tree.syncInfo.null")}\n`);
            }
          });
          tooltip.isTrusted = true; // 允许点击链接
        }
        const name = unescapeString(key);
        return {
          label: internalToDisplayName(name),
          description: definedInfo[element.key as string] || definedInfo[this.publicCtx.referredLang],
          tooltip,
          level: 3,
          name,
          key,
          data: [key],
          meta: element.meta,
          id: this.genId(element, key),
          contextValue: contextValueList.join(","),
          collapsibleState: vscode.TreeItemCollapsibleState.None
        };
      });
    }
    return [];
  }

  private async getUsageInfoChildren(element: ExtendedTreeItem): Promise<ExtendedTreeItem[]> {
    if (element.level === 0) {
      const undefinedEntries = Object.keys(this.undefinedEntryMap);
      return [
        { type: "used", label: t("tree.usedInfo.used"), num: this.usedKeySet.size },
        { type: "unused", label: t("tree.usedInfo.unused"), num: this.unusedKeySet.size },
        { type: "undefined", label: t("tree.usedInfo.undefined"), num: undefinedEntries.length }
      ].map(item => {
        let data: string[] = [];
        let description = String(item.num);
        let tooltip = "";
        const contextValueList = [item.num === 0 ? `${item.type}GroupHeader-None` : `${item.type}GroupHeader`];
        if (item.type === "used") {
          data = Array.from(this.usedKeySet);
        } else if (item.type === "unused") {
          data = Array.from(this.unusedKeySet);
        } else {
          data = undefinedEntries;
          if (item.num > 0) {
            contextValueList.push("IGNORE_UNDEFINED");
            const fixableNum = undefinedEntries.filter(key => {
              if (
                this.validateLanguageBeforeTranslate &&
                !validateLang(key, this.publicCtx.referredLang) &&
                this.unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.ignore
              )
                return false;
              if (this.ignorePossibleVariables && isEnglishVariable(key)) return false;
              return true;
            }).length;
            description = `${item.num}(${fixableNum})`;
            tooltip = t(`tree.undefinedInfo.tooltip`, item.num, fixableNum);
            if (fixableNum > 0) {
              contextValueList.push("GEN_KEY");
            }
          }
        }
        return {
          ...item,
          level: 1,
          root: element.root,
          description,
          id: this.genId(element, item.type),
          data,
          tooltip,
          contextValue: contextValueList.join(","),
          collapsibleState: vscode.TreeItemCollapsibleState[item.num === 0 ? "None" : "Collapsed"]
        };
      });
    } else if (element.level === 1) {
      if (element.type === "undefined") {
        return Object.keys(this.undefinedEntryMap)
          .sort()
          .map(item => {
            const contextValueList = ["undefinedEntry", "IGNORE_UNDEFINED"];
            const undefinedNum = Object.values(this.undefinedEntryMap[item]).reduce((acc, cur) => acc + cur.size, 0);
            const descriptions = [`<${undefinedNum}>`];
            if (this.autoTranslateMissingKey) {
              if (this.ignorePossibleVariables && isEnglishVariable(item)) {
                descriptions.push(t("tree.usedInfo.undefinedPossibleVariable"));
              } else if (this.validateLanguageBeforeTranslate && !validateLang(item, this.publicCtx.referredLang)) {
                descriptions.push(t("tree.usedInfo.undefinedNoSourceLang"));
                if (this.unmatchedLanguageAction !== UNMATCHED_LANGUAGE_ACTION.ignore) {
                  contextValueList.push("GEN_KEY");
                }
              } else {
                contextValueList.push("GEN_KEY");
              }
            }
            return {
              key: item,
              label: item,
              level: 2,
              data: [item],
              contextValue: contextValueList.join(","),
              description: descriptions.join(" "),
              type: element.type,
              root: element.root,
              id: this.genId(element, item),
              collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            };
          });
      } else if (element.type === "used") {
        return Array.from(this.usedKeySet).map(key => {
          const name = unescapeString(key);
          const usedNum = Object.values(this.usedEntryMap[name]).reduce((acc, cur) => acc + cur.size, 0);
          const entryInfo = this.dictionary[key];
          return {
            key,
            name,
            label: internalToDisplayName(name),
            description: `<${usedNum || "?"}>${entryInfo.value[this.displayLang]}`,
            level: 2,
            contextValue: usedNum === 0 ? "usedGroupItem-None" : "usedGroupItem",
            type: element.type,
            root: element.root,
            id: this.genId(element, key),
            collapsibleState: vscode.TreeItemCollapsibleState[usedNum === 0 ? "None" : "Collapsed"]
          };
        });
      } else {
        return Array.from(this.unusedKeySet).map(key => {
          const name = unescapeString(key);
          const entryInfo = this.dictionary[key];
          const contextValueList = ["unusedGroupItem", "COPY_NAME"];
          return {
            label: internalToDisplayName(name),
            description: entryInfo.value[this.displayLang],
            level: 2,
            root: element.root,
            data: [key],
            contextValue: contextValueList.join(","),
            id: this.genId(element, key),
            collapsibleState: vscode.TreeItemCollapsibleState.None
          };
        });
      }
    } else if (element.level === 2) {
      const entryUsedInfo =
        element.type === "used" ? this.usedEntryMap[element.name as string] : this.undefinedEntryMap[element.key as string];
      if (Object.keys(entryUsedInfo).length > 0) {
        const list: vscode.TreeItem[] = [];
        for (const filePath in entryUsedInfo) {
          const fileUri = vscode.Uri.file(filePath);
          const document = await vscode.workspace.openTextDocument(fileUri);
          entryUsedInfo[filePath].forEach(offset => {
            const [startPos, endPos] = offset.split(",").map(pos => document.positionAt(+pos));
            const range = new vscode.Range(startPos, endPos);
            list.push(new FileItem(fileUri, range));
          });
        }
        return list;
      }
      return [];
    }
    return [];
  }

  private getDictionaryChildren(element: ExtendedTreeItem): ExtendedTreeItem[] {
    const res = (element.stack || []).reduce((acc, item) => acc[item] as LangTree, this.tree) as string | LangTree;
    if (typeof res === "string") {
      return Object.entries(this.dictionary[res].value).map(item => {
        const contextValueList = ["dictionaryItem", "GO_TO_DEFINITION", "EDIT_VALUE"];
        if (item[1]) {
          contextValueList.push("COPY_VALUE");
        }
        return {
          label: internalToDisplayName(item[0]),
          description: item[1],
          tooltip: getLangText(item[0]) || t("common.unknownLang"),
          id: this.genId(element, item[0]),
          contextValue: contextValueList.join(","),
          key: res,
          value: item[1],
          meta: { scope: item[0] },
          collapsibleState: vscode.TreeItemCollapsibleState.None
        };
      });
    } else {
      return Object.entries(res)
        .sort((a, b) => {
          if (typeof a[1] !== typeof b[1]) {
            return typeof a[1] === "string" ? 1 : -1;
          } else {
            return a[0] > b[0] ? 1 : -1;
          }
        })
        .map(item => {
          const stack = (element.stack || []).concat(item[0]);
          return {
            label: internalToDisplayName(item[0]),
            description: typeof item[1] === "string" ? this.dictionary[item[1]].value[this.displayLang] : false,
            root: element.root,
            id: this.genId(element, item[0]),
            stack,
            tooltip: stack.join("."),
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
          };
        });
    }
  }

  private checkLangSyncInfo(lang: string) {
    const contextValueList = ["checkSyncInfo"];
    let tooltip = getLangText(lang) || t("common.unknownLang");
    if (!getLangText(lang)) {
      contextValueList.push("UNKNOWN_LANG");
    }
    const list: string[] = [];
    let icon = "pass";
    let data: string[] = [];
    if (this.#mage.detectedLangList.includes(lang)) {
      list.push(getLangText(lang) || t("common.unknownLang"));
      const lackNum = this.langInfo.lack[lang]?.length ?? 0;
      const extraNum = this.langInfo.extra[lang]?.length ?? 0;
      const nullNum = this.langInfo.null[lang]?.length ?? 0;
      if (lackNum > 0 || nullNum > 0) {
        data = [...(this.langInfo.lack[lang] ?? []), ...(this.langInfo.null[lang] ?? [])].filter(
          key => !!this.countryMap[this.publicCtx.referredLang][key]
        );
        if (data.length > 0) {
          contextValueList.push("FILL_VALUE");
        }
        if (this.isSyncing === true || (Array.isArray(this.isSyncing) && this.isSyncing.includes(lang))) {
          icon = "sync~spin";
        } else {
          icon = "sync";
        }
        list.push(`-${lackNum + nullNum}`);
      }
      if (extraNum > 0) {
        list.push(`+${extraNum}`);
      }
    }
    if (lang === this.publicCtx.referredLang && lang === this.displayLang) {
      list.push("🧙");
      tooltip += ` (${t("tree.syncInfo.baseline")})`;
      contextValueList.push("REFERENCE_LANG", "DISPLAY_LANG");
    } else if (lang === this.publicCtx.referredLang) {
      tooltip += ` (${t("tree.syncInfo.source")})`;
      list.push("🌐");
      contextValueList.push("REFERENCE_LANG");
    } else if (lang === this.displayLang) {
      tooltip += ` (${t("tree.syncInfo.display")})`;
      list.push("👁️");
      contextValueList.push("DISPLAY_LANG");
    } else if (!this.#mage.detectedLangList.includes(lang)) {
      icon = "sync-ignored";
      tooltip += ` (${t("tree.syncInfo.ignored")})`;
      contextValueList.push("IGNORED_LANG");
      list.push("👻");
    }
    return { desc: list.join(" "), icon, tooltip, context: contextValueList.join(","), data };
  }

  private getSyncInfo(lang: string) {
    const totalKeys = Object.keys(this.countryMap?.[lang] ?? {});
    totalKeys.sort((a, b) => (a > b ? 1 : -1));
    const commonEntryKeyList: string[] = [];
    const extraEntryKeyList = this.langInfo.extra?.[lang] ?? [];
    const nullEntryKeyList = this.langInfo.null?.[lang] ?? [];
    const lackEntryKeyList = this.langInfo.lack?.[lang] ?? [];
    totalKeys.forEach(key => {
      if (!extraEntryKeyList.includes(key) && !nullEntryKeyList.includes(key)) {
        commonEntryKeyList.push(key);
      }
    });
    const res = [
      { label: t("tree.syncInfo.normal"), num: commonEntryKeyList.length, data: commonEntryKeyList, type: "common" },
      {
        label: t("tree.syncInfo.null"),
        num: nullEntryKeyList.length,
        data: nullEntryKeyList,
        type: "null",
        contextValue: nullEntryKeyList.some(key => !!this.countryMap[this.publicCtx.referredLang][key]) ? "FILL_VALUE" : ""
      },
      {
        label: t("tree.syncInfo.lack"),
        num: lackEntryKeyList.length,
        data: lackEntryKeyList,
        type: "lack",
        contextValue: lackEntryKeyList.some(key => !!this.countryMap[this.publicCtx.referredLang][key]) ? "FILL_VALUE" : ""
      }
    ];
    if (this.publicCtx.syncBasedOnReferredEntries) {
      res.push({ label: t("tree.syncInfo.extra"), num: extraEntryKeyList.length, data: extraEntryKeyList, type: "extra" });
    }
    return res;
  }

  private getSyncPercent(): string {
    const lackList = Object.values(this.langInfo.lack);
    const lackNum = lackList.reduce((pre, cur) => pre + cur.length, 0);
    const nullList = Object.values(this.langInfo.null);
    const nullNum = nullList.reduce((pre, cur) => pre + cur.length, 0);
    let total = Object.keys(
      this.publicCtx.syncBasedOnReferredEntries ? this.countryMap[this.publicCtx.referredLang] : this.dictionary
    ).length;
    total = lackList.length ? total * lackList.length : total;
    return Math.floor(Number((((total - lackNum - nullNum) / total) * 10000).toFixed(0))) / 100 + "%";
  }

  private getUsagePercent(): string {
    const total = Object.keys(this.dictionary).length;
    if (total === 0) return "";
    return Math.floor(Number(((this.usedKeySet.size / total) * 10000).toFixed(0))) / 100 + "%";
  }

  private genId(element: ExtendedTreeItem, name: string): string {
    return `${element.id},${name}`;
  }
}

const treeInstance = new TreeProvider();

export { treeInstance };
