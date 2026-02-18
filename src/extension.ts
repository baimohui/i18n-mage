import * as vscode from "vscode";
import { treeInstance } from "@/views/tree";
import { DecoratorController } from "@/features/Decorator";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerAllCommands } from "@/commands";
import { registerAllListeners } from "@/listeners";
import { bindDisposablesToContext, registerDisposable } from "@/utils/dispose";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";
import { HoverProvider } from "./features/HoverProvider";
import { I18nCompletionProvider } from "./features/CompletionProvider";
import { StatusBarItemManager } from "./features/StatusBarItemManager";
import { CodeActionProvider } from "./features/CodeActionProvider";
import { RenameKeyProvider } from "./features/RenameProvider";
import { KeyDefinitionProvider } from "./features/DefinitionProvider";
import { KeyReferenceProvider } from "./features/ReferenceProvider";

class ExtensionState {
  private static instance: ExtensionState | null = null;
  private _enabled = true;
  private _context: vscode.ExtensionContext | null = null;
  private _extensionSubscriptions: vscode.Disposable[] = [];
  private _restoreRegisterCommand: (() => void) | null = null;

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
      return;
    }

    this.deactivateExtensions();
  }

  public async activateExtensions() {
    if (!this._context) return;

    NotificationManager.init();
    vscode.window.registerTreeDataProvider("i18nMage.grimoire", treeInstance);

    this.hookCommandRegistration();
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
    registerDisposable(vscode.languages.registerDefinitionProvider(selector, new KeyDefinitionProvider()));
    registerDisposable(vscode.languages.registerReferenceProvider(selector, new KeyReferenceProvider()));

    const statusBarItemManager = StatusBarItemManager.getInstance();
    statusBarItemManager.createStatusBarItem();
    registerDisposable(statusBarItemManager);

    this._extensionSubscriptions = bindDisposablesToContext(this._context);

    await wrapWithProgress({ title: "" }, async () => {
      await treeInstance.initTree();
    });
  }

  public deactivateExtensions() {
    if (this._context) {
      this._extensionSubscriptions.forEach(disposable => {
        disposable.dispose();
      });
      this._extensionSubscriptions.length = 0;
    }

    vscode.commands.executeCommand("setContext", "i18nMage.enabled", false);

    const decorator = DecoratorController.getInstance();
    decorator.dispose();

    this._restoreRegisterCommand?.();
    this._restoreRegisterCommand = null;
  }

  private hookCommandRegistration() {
    if (this._restoreRegisterCommand) return;

    type CommandApi = typeof vscode.commands & {
      registerCommand: typeof vscode.commands.registerCommand;
    };

    const commandApi = vscode.commands as CommandApi;
    const originalRegisterCommand = commandApi.registerCommand.bind(vscode.commands);

    commandApi.registerCommand = ((command: string, callback: (...args: unknown[]) => unknown, thisArg?: unknown) => {
      const wrappedCallback = function (this: unknown, ...args: unknown[]): unknown {
        if (command.startsWith("i18nMage.")) {
          NotificationManager.logCommandExecution(command, args);
        }
        const result = Reflect.apply(callback as (...invokeArgs: unknown[]) => unknown, this, args);
        return result;
      };
      return originalRegisterCommand(command, wrappedCallback as (...invokeArgs: unknown[]) => unknown, thisArg);
    }) as typeof vscode.commands.registerCommand;

    this._restoreRegisterCommand = () => {
      commandApi.registerCommand = originalRegisterCommand;
    };
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const extensionState = ExtensionState.getInstance();
  extensionState.initialize(context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async event => {
      if (event.affectsConfiguration("i18n-mage.general.enable")) {
        await extensionState.setEnabled(getConfig<boolean>("general.enable", true));
      }
    })
  );

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
