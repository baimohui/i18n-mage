import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { catchTEntries, unescapeString, getValueByAmbiguousEntryName, detectI18nFramework } from "@/utils/regex";
import { getPossibleLangPaths, isLikelyProjectPath, toAbsolutePath, toRelativePath } from "@/utils/fs";
import { getLangText } from "@/utils/langKey";
import { LangContextPublic, TEntry, LangTree, SORT_MODE, I18nSolution } from "@/types";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig, setConfig } from "@/utils/config";

interface ExtendedTreeItem extends vscode.TreeItem {
  level?: number;
  root?: string;
  type?: string;
  name?: string;
  key?: string;
  data?: any;
  stack?: string[];
}

class FileItem extends vscode.TreeItem {
  constructor(resourceUri: vscode.Uri, pos: vscode.Position, label: string) {
    super(resourceUri, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "fileItem";
    this.tooltip = `${resourceUri.fsPath}`;
    this.description = `${pos.line + 1}:${pos.character + 1}`;
    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [resourceUri, { selection: new vscode.Range(pos, pos.translate(0, label.length)) }]
    };
  }
}

class TreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  #mage: LangMage;
  publicCtx: LangContextPublic;
  isInitialized = false;
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
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ExtendedTreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
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
  }

  async initTree(): Promise<boolean> {
    const projectPath = toAbsolutePath(getConfig<string>("projectPath", ""));
    this.refresh();
    // const workspaceFolders = vscode.workspace.workspaceFolders;
    // if (workspaceFolders !== undefined && workspaceFolders.length > 0) {
    //   projectPath = workspaceFolders[0].uri.fsPath;
    // }
    let success = false;

    if (projectPath.trim() === "") {
      NotificationManager.showWarning(t("common.noWorkspaceWarn"));
      return false;
    } else if (!(await isLikelyProjectPath(projectPath))) {
      NotificationManager.showError(t("command.setProjectPath.invalidFolder"));
      return false;
    } else {
      this.#mage.setOptions({ projectPath });
      const configLangPath = getConfig<string>("langPath", "");
      if (configLangPath) {
        this.#mage.setOptions({ langPath: toAbsolutePath(configLangPath), task: "check", globalFlag: true, clearCache: true });
        await this.#mage.execute();
      }
      if (this.#mage.detectedLangList.length === 0) {
        const possibleLangPaths = await getPossibleLangPaths(projectPath);
        for (const langPath of possibleLangPaths) {
          this.#mage.setOptions({ langPath, task: "check", globalFlag: true, clearCache: false });
          await this.#mage.execute();
          if (this.#mage.detectedLangList.length > 0) {
            break;
          }
        }
      }
      if (this.#mage.detectedLangList.length === 0) {
        NotificationManager.showWarning(t("common.noLangPathDetectedWarn"), t("command.selectLangPath.title")).then(selection => {
          if (selection === t("command.selectLangPath.title")) {
            vscode.commands.executeCommand("i18nMage.selectLangPath");
          }
        });
        vscode.commands.executeCommand("setContext", "hasValidLangPath", false);
        success = false;
      } else {
        this.checkUsedInfo();
        vscode.commands.executeCommand("setContext", "hasValidLangPath", true);
        success = true;
      }
    }
    this.isInitialized = true;
    vscode.commands.executeCommand("setContext", "initialized", true);
    const sortMode = getConfig<string>("sorting.writeMode");
    vscode.commands.executeCommand("setContext", "allowSort", this.langInfo.isFlat && sortMode !== SORT_MODE.None);
    this.publicCtx = this.#mage.getPublicContext();
    const langPath = toRelativePath(this.publicCtx.langPath);
    const i18nSolution = detectI18nFramework(projectPath);
    setTimeout(() => {
      if (getConfig("langPath", "") !== langPath) {
        setConfig("langPath", langPath).catch(error => {
          console.error("Failed to set config for langPath:", error);
        });
      }
      if (i18nSolution !== null && i18nSolution !== getConfig<I18nSolution>("i18nSolution")) {
        setConfig("i18nSolution", i18nSolution).catch(error => {
          console.error("Failed to set config for i18nSolution:", error);
        });
      }
    }, 10000);

    return success;
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
        iconPath: new vscode.ThemeIcon("sync"),
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
      return [
        {
          label: t("tree.currentFile.defined"),
          description: String(this.definedEntriesInCurrentFile.length),
          collapsibleState: vscode.TreeItemCollapsibleState[this.definedEntriesInCurrentFile.length === 0 ? "None" : "Collapsed"],
          data: this.definedEntriesInCurrentFile.map(item => ({
            name: item.nameInfo.text,
            value: this.countryMap[this.publicCtx.referredLang][getValueByAmbiguousEntryName(this.tree, item.nameInfo.text) as string] ?? ""
            // value: this.dictionary[getValueByAmbiguousEntryName(this.tree, item.text) as string]?.[this.#mage.referredLang] ?? ""
          })),
          contextValue: definedContextValueList.join(","),
          level: 1,
          type: "defined",
          id: this.genId(element, "defined"),
          root: element.root
        },
        {
          label: t("tree.currentFile.undefined"),
          description: String(this.undefinedEntriesInCurrentFile.length),
          collapsibleState: vscode.TreeItemCollapsibleState[this.undefinedEntriesInCurrentFile.length === 0 ? "None" : "Collapsed"],
          level: 1,
          type: "undefined",
          id: this.genId(element, "undefined"),
          root: element.root
        }
      ];
    } else if (element.level === 1) {
      return this[element.type === "defined" ? "definedEntriesInCurrentFile" : "undefinedEntriesInCurrentFile"].map(entry => {
        const entryInfo = this.dictionary[getValueByAmbiguousEntryName(this.tree, entry.nameInfo.text) as string] ?? {};
        const contextValueList = [element.type === "defined" ? "definedEntryInCurFile" : "undefinedEntryInCurFile", "COPY_NAME"];
        return {
          label: entry.nameInfo.text,
          description: entryInfo[this.publicCtx.referredLang],
          collapsibleState: vscode.TreeItemCollapsibleState[element.type === "defined" ? "Collapsed" : "None"],
          level: 2,
          contextValue: contextValueList.join(","),
          usedInfo: this[element.type === "defined" ? "usedEntryMap" : "undefinedEntryMap"][entry.nameInfo.text],
          id: this.genId(element, entry.nameInfo.id || ""),
          root: element.root
        };
      });
    } else if (element.level === 2) {
      const entryKey = getValueByAmbiguousEntryName(this.tree, element.label as string) ?? "";
      const entryInfo = this.dictionary[entryKey];
      return this.langInfo.langList.map(lang => {
        const contextValueList = ["entryTranslationInCurFile", "COPY_VALUE", "GO_TO_DEFINITION", "EDIT_VALUE"];
        if (!getLangText(lang)) {
          contextValueList.push("INVALID_LANG");
        }
        return {
          label: lang,
          name: element.label as string,
          description: entryInfo[lang] ?? false,
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          level: 3,
          data: { name: element.label, key: entryKey, value: entryInfo[lang] ?? "", lang },
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
        const contextValueList = ["checkSyncInfo"];
        if (!getLangText(lang)) {
          contextValueList.push("INVALID_LANG");
        }
        return {
          level: 1,
          key: lang,
          label: lang,
          root: element.root,
          tooltip: getLangText(lang) || t("common.unknownLang"),
          id: this.genId(element, lang),
          contextValue: contextValueList.join(","),
          description: this.checkLangSyncInfo(lang),
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        };
      });
    } else if (element.level === 1) {
      return this.getSyncInfo(element.key as string).map(item => ({
        ...item,
        level: 2,
        key: element.key,
        root: element.root,
        id: this.genId(element, item.type),
        description: String(item.num),
        collapsibleState: vscode.TreeItemCollapsibleState[item.num === 0 ? "None" : item.type === "common" ? "Collapsed" : "Expanded"]
      }));
    } else if (element.level === 2) {
      return (element.data as [string, string][]).map(item => {
        const contextValueList = ["syncInfoItem", "EDIT_VALUE"];
        if (element.type !== "lack") {
          contextValueList.push("GO_TO_DEFINITION");
        }
        return {
          label: unescapeString(item[0]),
          description: item[1],
          level: 3,
          key: element.key,
          id: this.genId(element, item[0]),
          contextValue: contextValueList.join(","),
          data: { name: unescapeString(item[0]), key: item[0], value: element.type === "common" ? item[1] : "", lang: element.key },
          collapsibleState: vscode.TreeItemCollapsibleState.None
        };
      });
    }
    return [];
  }

  private async getUsageInfoChildren(element: ExtendedTreeItem): Promise<ExtendedTreeItem[]> {
    if (element.level === 0) {
      return [
        { type: "used", label: t("tree.usedInfo.used"), num: this.usedKeySet.size },
        { type: "unused", label: t("tree.usedInfo.unused"), num: this.unusedKeySet.size },
        { type: "undefined", label: t("tree.usedInfo.undefined"), num: Object.keys(this.undefinedEntryMap).length }
      ].map(item => ({
        ...item,
        level: 1,
        root: element.root,
        description: String(item.num),
        id: this.genId(element, item.type),
        data: Array.from(item.type === "used" ? this.usedKeySet : this.unusedKeySet),
        contextValue: item.num === 0 ? `${item.type}GroupHeader-None` : `${item.type}GroupHeader`,
        collapsibleState: vscode.TreeItemCollapsibleState[item.num === 0 ? "None" : "Collapsed"]
      }));
    } else if (element.level === 1) {
      if (element.type === "undefined") {
        return Object.keys(this.undefinedEntryMap)
          .sort()
          .map(item => {
            const undefinedNum = Object.values(this.undefinedEntryMap[item]).flat().length;
            return {
              key: item,
              label: item,
              level: 2,
              description: `<${undefinedNum}>`,
              type: element.type,
              root: element.root,
              id: this.genId(element, item),
              collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            };
          });
      } else if (element.type === "used") {
        return Array.from(this.usedKeySet).map(key => {
          const name = unescapeString(key);
          const usedNum = Object.values(this.usedEntryMap[name]).flat().length;
          const entryInfo = this.dictionary[key];
          return {
            key,
            name,
            label: name,
            description: `<${usedNum || "?"}>${entryInfo[this.publicCtx.referredLang]}`,
            level: 2,
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
          return {
            label: name,
            description: entryInfo[this.publicCtx.referredLang],
            level: 2,
            root: element.root,
            data: [key],
            contextValue: "unusedGroupItem",
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
          entryUsedInfo[filePath].forEach((offset: number) => {
            const pos = document.positionAt(offset);
            list.push(new FileItem(fileUri, pos, element.key as string));
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
      const contextValueList = ["dictionaryItem", "COPY_VALUE", "GO_TO_DEFINITION", "EDIT_VALUE"];
      return Object.entries(this.dictionary[res]).map(item => ({
        label: item[0],
        description: item[1],
        tooltip: getLangText(item[0]) || t("common.unknownLang"),
        id: this.genId(element, item[0]),
        contextValue: contextValueList.join(","),
        data: { key: res, value: item[1], lang: item[0] },
        collapsibleState: vscode.TreeItemCollapsibleState.None
      }));
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
            label: item[0],
            description: typeof item[1] === "string" ? this.dictionary[item[1]][this.publicCtx.referredLang] : false,
            root: element.root,
            id: this.genId(element, item[0]),
            stack,
            tooltip: stack.join("."),
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
          };
        });
    }
  }

  public checkUsedInfo(): void {
    this.definedEntriesInCurrentFile = [];
    this.undefinedEntriesInCurrentFile = [];
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const text = editor.document.getText();
      this.usedEntries = catchTEntries(text);
      this.usedEntries.forEach(entry => {
        const { text, regex } = entry.nameInfo;
        if (Object.hasOwn(this.undefinedEntryMap, text)) {
          if (!this.undefinedEntriesInCurrentFile.some(item => item.nameInfo.text === text)) {
            this.undefinedEntriesInCurrentFile.push(entry);
          }
          return;
        }
        if (Object.hasOwn(this.usedEntryMap, text)) {
          if (!this.definedEntriesInCurrentFile.some(item => item.nameInfo.text === text)) {
            this.definedEntriesInCurrentFile.push(entry);
          }
          return;
        }
        const matchList = Object.keys(this.usedEntryMap).filter(key => regex.test(key));
        matchList.forEach(matchItem => {
          if (!this.definedEntriesInCurrentFile.some(item => item.nameInfo.text === matchItem)) {
            const newEntry = { ...entry, nameInfo: { ...entry.nameInfo, text: matchItem, id: matchItem } };
            this.definedEntriesInCurrentFile.push(newEntry);
          }
        });
      });
      this.refresh();
    }
  }

  private checkLangSyncInfo(lang: string): string {
    const list: string[] = [];
    const lackNum = this.langInfo.lack[lang].length;
    const extraNum = this.langInfo.extra[lang].length;
    const nullNum = this.langInfo.null[lang].length;
    if (lackNum > 0 || nullNum > 0) {
      list.push(`-${lackNum + nullNum}`);
    }
    if (extraNum > 0) {
      list.push(`+${extraNum}`);
    }
    if (lackNum === 0 && extraNum === 0 && nullNum === 0) {
      list.push(t("tree.syncInfo.synced"));
    }
    if (lang === this.publicCtx.referredLang) {
      list.push(t("tree.syncInfo.referred"));
    }
    return list.join(" ");
  }

  private getSyncInfo(lang: string) {
    const totalEntries = Object.entries(this.langInfo.countryMap?.[lang] ?? {});
    totalEntries.sort((a, b) => (a[0] > b[0] ? 1 : -1));
    const commonEntries: [string, string][] = [];
    const extraEntries: [string, string][] = [];
    const extraEntryNameList = this.langInfo.extra?.[lang] ?? [];
    const nullEntryNameList = this.langInfo.null?.[lang] ?? [];
    totalEntries.forEach(item => {
      if (extraEntryNameList.includes(item[0])) {
        extraEntries.push(item);
      } else if (!nullEntryNameList.includes(item[0])) {
        commonEntries.push(item);
      }
    });
    const lackEntries = (this.langInfo.lack?.[lang] ?? []).map(item => [item, this.dictionary[item][this.publicCtx.referredLang]]);
    const nullEntries = nullEntryNameList.map(item => [item, this.dictionary[item][this.publicCtx.referredLang]]);
    const res = [
      { label: t("tree.syncInfo.normal"), num: commonEntries.length, data: commonEntries, type: "common" },
      { label: t("tree.syncInfo.null"), num: nullEntries.length, data: nullEntries, type: "null" },
      { label: t("tree.syncInfo.lack"), num: lackEntries.length, data: lackEntries, type: "lack" }
    ];
    if (this.publicCtx.syncBasedOnReferredEntries) {
      res.push({ label: t("tree.syncInfo.extra"), num: extraEntries.length, data: extraEntries, type: "extra" });
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
