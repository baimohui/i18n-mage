import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { t } from "@/utils/i18n";
import { registerDisposable } from "@/utils/dispose";

const MAX_HISTORY = 50;
const HISTORY_KEY = "i18nMage.searchHistory";

type ToggleButtonId = "caseSensitive" | "wholeWord" | "sourceLangOnly";

interface ToggleButtonConfig {
  id: ToggleButtonId;
  iconOff: { light: string; dark: string };
  iconOn: { light: string; dark: string };
  tooltipOff: string;
  tooltipOn: string;
  getState: () => boolean;
  toggle: () => void;
}

function getToggleButtons(): ToggleButtonConfig[] {
  return [
    {
      id: "caseSensitive",
      iconOff: { light: "caseMatch-light.svg", dark: "caseMatch-dark.svg" },
      iconOn: { light: "caseMatch-active-light.svg", dark: "caseMatch-active-dark.svg" },
      tooltipOff: t("tree.search.caseSensitiveMatching"),
      tooltipOn: t("tree.search.caseSensitiveMatchingEnabled"),
      getState: () => treeInstance.isCaseSensitive,
      toggle: () => treeInstance.toggleCaseSensitive()
    },
    {
      id: "wholeWord",
      iconOff: { light: "wholeMatch-light.svg", dark: "wholeMatch-dark.svg" },
      iconOn: { light: "wholeMatch-active-light.svg", dark: "wholeMatch-active-dark.svg" },
      tooltipOff: t("tree.search.wholeWordMatching"),
      tooltipOn: t("tree.search.wholeWordMatchingEnabled"),
      getState: () => treeInstance.isWholeWordMatch,
      toggle: () => treeInstance.toggleWholeWordMatch()
    },
    {
      id: "sourceLangOnly",
      iconOff: { light: "s-light.svg", dark: "s-dark.svg" },
      iconOn: { light: "s-active-light.svg", dark: "s-active-dark.svg" },
      tooltipOff: t("tree.search.sourceLanguageOnly"),
      tooltipOn: t("tree.search.sourceLanguageOnlyEnabled"),
      getState: () => treeInstance.isSourceLangOnly,
      toggle: () => treeInstance.toggleSourceLangOnly()
    }
  ];
}

function createToggleButtonUri(iconName: string): { light: vscode.Uri; dark: vscode.Uri } {
  return {
    light: vscode.Uri.joinPath(vscode.Uri.file(__dirname), "..", "..", "images", iconName),
    dark: vscode.Uri.joinPath(vscode.Uri.file(__dirname), "..", "..", "images", iconName)
  };
}

interface QuickPickButton {
  iconPath: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon;
  tooltip?: string | undefined;
}

function createToggleQuickPickButton(config: ToggleButtonConfig): QuickPickButton {
  const isActive = config.getState();
  const tooltip = isActive ? config.tooltipOn : config.tooltipOff;
  const button: QuickPickButton = {
    iconPath: createToggleButtonUri(isActive ? config.iconOn.light : config.iconOff.light),
    tooltip
  };
  return button;
}

class SearchQuickPick {
  private qp: vscode.QuickPick<vscode.QuickPickItem> | null = null;
  private context: vscode.ExtensionContext;
  private history: string[] = [];
  private toggleButtons: ToggleButtonConfig[];
  private isSearching = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.toggleButtons = getToggleButtons();
    this.loadHistory();
  }

  private loadHistory(): void {
    const stored = this.context.workspaceState.get<string[]>(HISTORY_KEY, []);
    this.history = stored;
  }

  private saveHistory(): void {
    void this.context.workspaceState.update(HISTORY_KEY, this.history);
  }

  private addHistoryEntry(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Remove duplicate
    this.history = this.history.filter(entry => entry !== trimmed);
    // Add to front
    this.history.unshift(trimmed);
    // Trim to max
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(0, MAX_HISTORY);
    }
    this.saveHistory();
  }

  private updateHistoryItems(): void {
    if (!this.qp) return;
    if (this.qp.value === "" && this.history.length > 0) {
      this.qp.items = this.history.map(text => ({
        label: text,
        description: ""
      }));
    } else {
      this.qp.items = [];
    }
  }

  private updateToggleButtons(): void {
    if (!this.qp) return;
    const buttons: QuickPickButton[] = [];
    for (const config of this.toggleButtons) {
      buttons.push(createToggleQuickPickButton(config));
    }
    this.qp.buttons = buttons;
  }

  private getDefaultValue(): string {
    let defaultValue = treeInstance.globalFilter.text;
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      defaultValue = editor.document.getText(editor.selection);
    }
    return defaultValue;
  }

  show(): void {
    if (this.qp) {
      this.qp.dispose();
      this.qp = null;
    }

    const defaultValue = this.getDefaultValue();

    this.qp = vscode.window.createQuickPick<vscode.QuickPickItem>();
    this.qp.placeholder = t("command.searchEntry.placeHolder");
    this.qp.ignoreFocusOut = true;
    this.qp.value = defaultValue;
    this.qp.matchOnDescription = false;
    this.qp.matchOnDetail = false;

    this.updateToggleButtons();
    this.updateHistoryItems();

    // 打开搜索时切换到侧边栏插件视图
    vscode.commands.executeCommand("workbench.view.extension.i18nMage");

    // 实时输入过滤
    this.qp.onDidChangeValue(value => {
      if (!this.qp) return;
      if (value.trim() === "") {
        // 输入为空时显示历史记录
        this.updateHistoryItems();
        if (this.isSearching) {
          treeInstance.cancelSearch();
          this.isSearching = false;
        }
      } else {
        this.qp.items = [];
        treeInstance.setSearch(value.trim());
        this.isSearching = true;
      }
    });

    // Enter 键 → 导航到下一个结果
    this.qp.onDidAccept(() => {
      const selectedItem = this.qp?.selectedItems?.[0];
      if (selectedItem && this.qp?.value === "") {
        // 从历史记录中选择了一项
        const historyText = selectedItem.label;
        this.qp.value = historyText;
        this.qp.items = [];
        treeInstance.setSearch(historyText);
        this.isSearching = true;
        return;
      }

      const value = this.qp?.value?.trim() ?? "";
      if (value !== "") {
        this.addHistoryEntry(value);
        if (this.isSearching) {
          treeInstance.navigateSearchResult("nextGlobalEntry");
        }
      }
    });

    // 切换按钮
    this.qp.onDidTriggerButton(button => {
      const index = this.qp?.buttons.indexOf(button);
      if (index === undefined || index < 0 || index >= this.toggleButtons.length) return;

      const config = this.toggleButtons[index];
      config.toggle();
      this.updateToggleButtons();

      // 如果正在搜索，刷新结果
      if (this.isSearching) {
        treeInstance.setSearch(this.qp?.value?.trim() ?? "");
      }
    });

    // 隐藏时取消搜索
    this.qp.onDidHide(() => {
      if (this.isSearching) {
        treeInstance.cancelSearch();
        this.isSearching = false;
      }
    });

    this.qp.show();
  }

  focus(): void {
    if (this.qp) {
      this.qp.value = this.getDefaultValue();
      this.qp.show();
      return;
    }
    this.show();
  }

  hide(): void {
    if (this.qp) {
      this.qp.dispose();
      this.qp = null;
    }
    if (this.isSearching) {
      treeInstance.cancelSearch();
      this.isSearching = false;
    }
  }

  dispose(): void {
    this.hide();
  }
}

let instance: SearchQuickPick | null = null;

export function initSearchQuickPick(context: vscode.ExtensionContext): void {
  instance = new SearchQuickPick(context);
  registerDisposable({ dispose: () => instance?.dispose() });
}

export function getSearchQuickPick(): SearchQuickPick {
  if (!instance) {
    throw new Error("SearchQuickPick not initialized. Call initSearchQuickPick first.");
  }
  return instance;
}
