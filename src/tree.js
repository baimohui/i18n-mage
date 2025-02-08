const vscode = require("vscode");
const LangCheckRobot = require("./langCheckRobot");
const { catchTEntries } = require("./utils/regex");
const { isPathInsideDirectory } = require("./utils/fs");
const { getLangText } = require("./utils/const");

class FileItem extends vscode.TreeItem {
  constructor(resourceUri, pos, label) {
    super(resourceUri, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `${resourceUri.fsPath}`;
    this.description = `${pos.c + 1}:${pos.e + 1}`;
    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [resourceUri, { selection: new vscode.Range(pos, pos.translate(0, label.length)) }]
    };
  }
}

class treeProvider {
  #robot;
  constructor() {
    this.#robot = LangCheckRobot.getInstance();
    this.usedEntries = [];
    this.definedEntriesInCurrentFile = [];
    this.undefinedEntriesInCurrentFile = [];
    this.usedEntryMap = this.#robot.langDetail.used || {};
    this.undefinedEntryMap = this.#robot.langDetail.undefined || {};
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    vscode.window.onDidChangeActiveTextEditor(() => this.onActiveEditorChanged());
    vscode.workspace.onDidSaveTextDocument(e => this.onDocumentChanged(e));
    // vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e));
    this.onActiveEditorChanged();
  }
  get langInfo() {
    return this.#robot.langDetail;
  }
  get dictionary() {
    return this.langInfo.dictionary;
  }
  get tree() {
    return this.langInfo.tree;
  }
  get entryReferredTextMap() {
    return this.langInfo.countryMap[this.#robot.referredLang] || {};
  }
  get entryUsageInfo() {
    const dictionary = this.langInfo.dictionary;
    const unusedEntries = [],
      usedEntries = [];
    for (const entry in dictionary) {
      if (!this.langInfo.used[entry]) {
        unusedEntries.push(entry);
      } else {
        usedEntries.push(entry);
      }
    }
    return { used: usedEntries, unused: unusedEntries };
  }
  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
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
  getRootChildren() {
    return [
      {
        level: 0,
        label: "当前文件",
        id: "CURRENT_FILE",
        root: "CURRENT_FILE",
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        description: String(this.definedEntriesInCurrentFile.length + this.undefinedEntriesInCurrentFile.length)
      },
      {
        level: 0,
        label: "同步情况",
        id: "SYNC_INFO",
        root: "SYNC_INFO",
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        description: this.getSyncPercent()
      },
      {
        level: 0,
        label: "使用情况",
        id: "USAGE_INFO",
        root: "USAGE_INFO",
        contextValue: "checkUsage",
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        description: this.getUsagePercent()
      },
      {
        level: 0,
        label: "词条汇总",
        id: "DICTIONARY",
        root: "DICTIONARY",
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        description: String(Object.keys(this.langInfo.dictionary).length)
      }
    ];
  }
  getCurrentFileChildren(element) {
    if (element.level === 0) {
      return [
        {
          label: "已定义",
          description: String(this.definedEntriesInCurrentFile.length),
          collapsibleState: vscode.TreeItemCollapsibleState[this.definedEntriesInCurrentFile.length === 0 ? "None" : "Collapsed"],
          level: 1,
          type: "defined",
          id: this.genId(element, "defined"),
          root: element.root
        },
        {
          label: "未定义",
          description: String(this.undefinedEntriesInCurrentFile.length),
          collapsibleState: vscode.TreeItemCollapsibleState[this.undefinedEntriesInCurrentFile.length === 0 ? "None" : "Collapsed"],
          level: 1,
          type: "undefined",
          id: this.genId(element, "undefined"),
          root: element.root
        }
      ];
    } else if (element.level === 1) {
      return this[element.type === "defined" ? "definedEntriesInCurrentFile" : "undefinedEntriesInCurrentFile"].map(entry => ({
        label: entry.text,
        description: this.entryReferredTextMap[entry.text] ?? false,
        collapsibleState: vscode.TreeItemCollapsibleState[element.type === "defined" ? "Collapsed" : "None"],
        level: 2,
        id: this.genId(element, entry.id),
        root: element.root
      }));
    } else if (element.level === 2) {
      const entryInfo = this.dictionary[element.label];
      return this.langInfo.langList.map(lang => ({
        label: lang,
        description: entryInfo[lang] ?? false,
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        level: 3,
        id: this.genId(element, lang),
        tooltip: getLangText(lang)
      }));
    }
    return [];
  }
  getSyncInfoChildren(element) {
    if (element.level === 0) {
      return this.langInfo.langList.map(lang => ({
        level: 1,
        key: lang,
        label: lang,
        root: element.root,
        tooltip: getLangText(lang),
        id: this.genId(element, lang),
        contextValue: "checkSyncInfo",
        description: this.checkLangSyncInfo(lang),
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
      }));
    } else if (element.level === 1) {
      return this.getSyncInfo(element.key).map(item => ({
        ...item,
        level: 2,
        key: element.key,
        root: element.root,
        id: this.genId(element, item.type),
        description: String(item.num),
        collapsibleState: vscode.TreeItemCollapsibleState[item.num === 0 ? "None" : item.type === "common" ? "Collapsed" : "Expanded"]
      }));
    } else if (element.level === 2) {
      return element.data.map(item => ({
        label: item[0],
        description: item[1],
        level: 3,
        key: element.key,
        id: this.genId(element, item[0]),
        collapsibleState: vscode.TreeItemCollapsibleState.None
      }));
    }
    return [];
  }
  async getUsageInfoChildren(element) {
    if (element.level === 0) {
      return [
        { type: "used", label: "已使用", num: this.entryUsageInfo.used.length },
        { type: "unused", label: "未使用", num: this.entryUsageInfo.unused.length },
        { type: "undefined", label: "未定义", num: Object.keys(this.undefinedEntryMap).length }
      ].map(item => ({
        ...item,
        level: 1,
        root: element.root,
        description: String(item.num),
        id: this.genId(element, item.type),
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
              // label: `${item} (${undefinedNum})`,
              level: 2,
              description: `<${undefinedNum}>`,
              type: element.type,
              root: element.root,
              id: this.genId(element, item),
              collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            };
          });
      } else if (element.type === "used") {
        return this.entryUsageInfo.used.sort().map(item => {
          const usedNum = Object.values(this.usedEntryMap[item]).flat().length;
          return {
            key: item,
            // label: `${item} (${usedNum})`,
            label: item,
            description: `<${usedNum}>${this.entryReferredTextMap[item]}`,
            level: 2,
            type: element.type,
            root: element.root,
            id: this.genId(element, item),
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
          };
        });
      } else {
        return this.entryUsageInfo.unused.sort().map(item => ({
          label: item,
          description: this.entryReferredTextMap[item],
          level: 2,
          root: element.root,
          id: this.genId(element, item),
          collapsibleState: vscode.TreeItemCollapsibleState.None
        }));
      }
    } else if (element.level === 2) {
      const entryUsedInfo = this[element.type === "used" ? "usedEntryMap" : "undefinedEntryMap"][element.key];
      if (entryUsedInfo) {
        const list = [];
        for (const filePath in entryUsedInfo) {
          const fileUri = vscode.Uri.file(filePath);
          const document = await vscode.workspace.openTextDocument(fileUri);
          entryUsedInfo[filePath].sort().forEach(offset => {
            const pos = document.positionAt(offset);
            list.push(new FileItem(fileUri, pos, element.key));
          });
        }
        return list;
      }
      return [];
    }
    return [];
  }
  getDictionaryInfoChildren(element) {
    if (element.level === 0) {
      return Object.keys(this.tree)
        .sort()
        .map(item => {
          return {
            label: item,
            level: element.level + 1,
            id: this.genId(element, item),
            root: element.root,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
          };
        });
    }
  }
  getDictionaryChildren(element) {
    const res = (element.stack || []).reduce((acc, item) => acc[item], this.tree);
    if (typeof res === "string") {
      return Object.entries(this.dictionary[res]).map(item => ({
        label: item[0],
        description: item[1],
        tooltip: getLangText(item[0]),
        id: this.genId(element, item[0]),
        collapsibleState: vscode.TreeItemCollapsibleState.None
      }));
    } else {
      return Object.entries(res).sort((a, b) => {
        if (typeof a[1] !== typeof b[1]) {
          return typeof a[1] === "string" ? 1 : -1;
        } else {
          return a[0] > b[0] ? 1 : -1
        }
      }).map(item => {
        const stack = (element.stack || []).concat(item[0])
        return {
          label: item[0],
          description: typeof item[1] === "string" ? this.entryReferredTextMap[item[1]] : false,
          root: element.root,
          id: this.genId(element, item[0]),
          stack,
          tooltip: stack.join("."),
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
        }
      });
    }
  }
  onActiveEditorChanged() {
    this.definedEntriesInCurrentFile = [];
    this.undefinedEntriesInCurrentFile = [];
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const text = editor.document.getText();
      this.usedEntries = catchTEntries(text);
      const usedEntryMap = this.#robot.langDetail.used || {};
      this.usedEntries.forEach(entry => {
        if (usedEntryMap[entry.text]) {
          if (this.definedEntriesInCurrentFile.every(item => item.text !== entry.text)) {
            this.definedEntriesInCurrentFile.push(entry);
          }
        } else {
          this.undefinedEntriesInCurrentFile.push(entry);
        }
      });
      this.refresh();
    }
  }
  async onDocumentChanged(content) {
    if (isPathInsideDirectory(this.#robot.langDir, content.fileName)) {
      this.#robot.setOptions({ task: "check", globalFlag: false, clearCache: false });
      await this.#robot.check();
      this.refresh();
    }
  }
  checkLangSyncInfo(lang) {
    const list = [];
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
      list.push("已同步");
    }
    if (lang === this.#robot.referredLang) {
      list.push("参考");
    }
    return list.join(" ");
  }
  getSyncInfo(lang) {
    const totalEntries = Object.entries(this.langInfo.countryMap?.[lang] || {});
    totalEntries.sort((a, b) => (a[0] > b[0] ? 1 : -1));
    const commonEntries = [];
    const extraEntries = [];
    const extraEntryNameList = this.langInfo.extra?.[lang] || [];
    const nullEntryNameList = this.langInfo.null?.[lang] || [];
    totalEntries.forEach(item => {
      if (extraEntryNameList.includes(item[0])) {
        extraEntries.push(item);
      } else if (!nullEntryNameList.includes(item[0])) {
        commonEntries.push(item);
      }
    });
    const lackEntries = (this.langInfo.lack?.[lang] || []).map(item => [item, this.entryReferredTextMap[item]]);
    const nullEntries = nullEntryNameList.map(item => [item, this.entryReferredTextMap[item]]);
    const res = [
      { label: "正常", num: commonEntries.length, data: commonEntries, type: "common" },
      { label: "空值", num: nullEntries.length, data: nullEntries, type: "null" },
      { label: "缺失", num: lackEntries.length, data: lackEntries, type: "lack" }
    ];
    if (this.#robot.syncBasedOnReferredEntries) {
      res.push({ label: "多余", num: extraEntries.length, data: extraEntries, type: "extra" });
    }
    return res;
  }
  getSyncPercent() {
    const lackList = Object.values(this.langInfo.lack);
    const lackNum = lackList.reduce((pre, cur) => pre + cur.length, 0);
    const nullList = Object.values(this.langInfo.null);
    const nullNum = nullList.reduce((pre, cur) => pre + cur.length, 0);
    let total = this.#robot.syncBasedOnReferredEntries ? this.langInfo.refer.length : Object.keys(this.dictionary).length;
    total = total * lackList.length;
    return (Math.floor(((total - lackNum - nullNum) / total) * 10000) / 100).toFixed(2) + "%";
  }
  getUsagePercent() {
    const total = Object.keys(this.dictionary).length;
    if (total === 0) return "";
    return Math.floor(Number(((this.entryUsageInfo.used.length / total) * 10000).toFixed(0))) / 100 + "%";
  }
  genId(element, name) {
    return `${element.id},${name}`;
  }
}

module.exports = { treeProvider };
