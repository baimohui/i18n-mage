import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { DecoratorController } from "@/features/Decorator";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerAllCommands } from "@/commands";
import { registerAllListeners } from "@/listeners";
import { bindDisposablesToContext } from "@/utils/dispose";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";
import { HoverProvider } from "./features/HoverProvider";
import { I18nCompletionProvider } from "./features/I18nCompletionProvider";
import { registerDisposable } from "@/utils/dispose";
import { StatusBarItemManager } from "./features/StatusBarItemManager";
import { CodeActionProvider } from "./features/CodeActionProvider";
import { RenameKeyProvider } from "./features/RenameProvider";

// 全局状态管理
class ExtensionState {
  private static instance: ExtensionState | null = null;
  private _enabled: boolean = true;
  private _context: vscode.ExtensionContext | null = null;
  private _extensionSubscriptions: vscode.Disposable[] = []; // 单独保存插件功能相关的订阅

  private constructor() {}

  public static getInstance(): ExtensionState {
    if (!ExtensionState.instance) {
      ExtensionState.instance = new ExtensionState();
    }
    return ExtensionState.instance;
  }

  public initialize(context: vscode.ExtensionContext) {
    this._context = context;
    this._enabled = getConfig<boolean>("general.enable", true);
    vscode.commands.executeCommand("setContext", "i18nMage.enabled", this._enabled);
  }

  get enabled(): boolean {
    return this._enabled;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    if (this._enabled === enabled) return;
    this._enabled = enabled;
    vscode.commands.executeCommand("setContext", "i18nMage.enabled", enabled);
    if (enabled) {
      await this.activateExtensions();
    } else {
      this.deactivateExtensions();
    }
  }

  public async activateExtensions() {
    if (!this._context) return;
    NotificationManager.init();
    vscode.window.registerTreeDataProvider("treeProvider", treeInstance);
    registerAllCommands(this._context);
    registerAllListeners();
    registerDisposable(vscode.languages.registerHoverProvider("*", new HoverProvider()));
    const selector = [
      { language: "javascript", scheme: "file" },
      { language: "typescript", scheme: "file" },
      { language: "vue", scheme: "file" },
      { language: "javascriptreact", scheme: "file" },
      { language: "typescriptreact", scheme: "file" }
    ];
    registerDisposable(vscode.languages.registerCompletionItemProvider(selector, new I18nCompletionProvider(), '"', "'", "`"));
    registerDisposable(vscode.languages.registerCodeActionsProvider(selector, new CodeActionProvider()));
    registerDisposable(vscode.languages.registerRenameProvider(selector, new RenameKeyProvider()));
    const statusBarItemManager = StatusBarItemManager.getInstance();
    statusBarItemManager.createStatusBarItem();
    registerDisposable(statusBarItemManager);
    this._extensionSubscriptions = bindDisposablesToContext(this._context);
    await wrapWithProgress({ title: "" }, async () => {
      await treeInstance.initTree();
    });
  }

  public deactivateExtensions() {
    // 清理所有资源
    if (this._context) {
      // 这里手动触发清理
      this._extensionSubscriptions.forEach(d => {
        d.dispose();
      });
      this._extensionSubscriptions.length = 0; // 清空订阅
    }
    // 隐藏树视图
    vscode.commands.executeCommand("setContext", "i18nMage.enabled", false);
    // 清除装饰器
    const decorator = DecoratorController.getInstance();
    decorator.dispose();
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const extensionState = ExtensionState.getInstance();
  extensionState.initialize(context);
  // 监听配置变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (e.affectsConfiguration("i18n-mage.general.enable")) {
        await extensionState.setEnabled(getConfig<boolean>("general.enable", true));
      }
    })
  );
  // 初始激活
  if (extensionState.enabled) {
    await extensionState.activateExtensions();
  }
}

export function deactivate() {
  const extensionState = ExtensionState.getInstance();
  if (extensionState.enabled) {
    extensionState.deactivateExtensions();
  }
}
