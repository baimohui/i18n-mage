import * as vscode from "vscode";
import { ExecutionContext } from "./context";
import { ExecutionResult } from "@/types";
import { getCacheConfig } from "./config";

const PREFIX = "";

type LogType = "success" | "warn" | "error" | "info";

export class NotificationManager {
  private static outputChannel: vscode.OutputChannel;
  private static readonly DEBUG_CONFIG_KEY = "general.enableDebugLog";

  private static ensureOutputChannel() {
    if (this.outputChannel === undefined) {
      this.outputChannel = vscode.window.createOutputChannel("i18n Mage");
    }
    return this.outputChannel;
  }

  static init() {
    this.outputChannel = vscode.window.createOutputChannel("i18n Mage");
    this.logDebug("Notification channel initialized");
  }

  static showOutputChannel() {
    this.ensureOutputChannel().show();
  }

  static setStatusBarMessage(message: string, time: number = 3000) {
    vscode.window.setStatusBarMessage(`$(comment) ${message}`, time);
  }

  static showTitle(title: string): void {
    const divider = "=".repeat(title.length + 4);
    const output = this.ensureOutputChannel();
    output.appendLine(`\n${divider}`);
    output.appendLine(`  ${title}  `);
    output.appendLine(`${divider}\n`);
    NotificationManager.setStatusBarMessage(title);
    this.logDebug(`Title shown: ${title}`);
  }

  static showProgress(data: { message?: string; type?: LogType; increment?: number }): void {
    if (data.message !== undefined) {
      this.logToOutput(data.message, data.type);
      this.logDebug(`Progress message: ${data.message}`);
    }
    ExecutionContext.progress?.report(data);
  }

  static hideProgress(): void {
    ExecutionContext.progress?.report({ message: "" });
  }

  static showResult(result: ExecutionResult, ...items: string[]): Thenable<string | undefined> {
    const typeNum = Math.floor(result.code / 100);
    this.logDebug(
      `Execution result code=${result.code}, message=${result.message ?? ""}, defaultSuccess=${
        result.defaultSuccessMessage ?? ""
      }, defaultError=${result.defaultErrorMessage ?? ""}`
    );

    switch (typeNum) {
      case 1:
        return this.showSuccess((result.message || result.defaultSuccessMessage) ?? "", ...items);
      case 2:
        return this.showSuccess((result.message || result.defaultSuccessMessage) ?? "", ...items);
      case 3:
        return this.showWarning(result.message ?? "", ...items);
      case 4:
        return this.showError((result.message || result.defaultErrorMessage) ?? "", ...items);
      default:
        return this.showSuccess((result.message || result.defaultSuccessMessage) ?? "", ...items);
    }
  }

  static showSuccess(message: string, ...items: string[]): Thenable<string | undefined>;
  static showSuccess(message: string, options: vscode.MessageOptions, ...items: string[]): Thenable<string | undefined>;
  static showSuccess<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>;
  static showSuccess<T extends vscode.MessageItem>(message: string, options: vscode.MessageOptions, ...items: T[]): Thenable<T | undefined>;
  static showSuccess(
    message: string,
    optionsOrItem?: vscode.MessageOptions | string | vscode.MessageItem,
    ...items: Array<string | vscode.MessageItem>
  ): Thenable<string | vscode.MessageItem | undefined> {
    NotificationManager.setStatusBarMessage(`${message}`);
    this.logToOutput(message, "success");
    this.logDebug(`User-visible success: ${message}`);
    const resolved = this.resolveMessageArgs(optionsOrItem, items);
    return this.showInformation(`${PREFIX}${message}`, resolved);
  }

  static showError(message: string, ...items: string[]): Thenable<string | undefined>;
  static showError(message: string, options: vscode.MessageOptions, ...items: string[]): Thenable<string | undefined>;
  static showError<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>;
  static showError<T extends vscode.MessageItem>(message: string, options: vscode.MessageOptions, ...items: T[]): Thenable<T | undefined>;
  static showError(
    message: string,
    optionsOrItem?: vscode.MessageOptions | string | vscode.MessageItem,
    ...items: Array<string | vscode.MessageItem>
  ): Thenable<string | vscode.MessageItem | undefined> {
    this.ensureOutputChannel().show();
    this.logToOutput(message, "error");
    this.logDebug(`User-visible error: ${message}`);
    const resolved = this.resolveMessageArgs(optionsOrItem, items);
    return this.showErrorMessage(`${PREFIX}${message}`, resolved);
  }

  static showWarning(message: string, ...items: string[]): Thenable<string | undefined>;
  static showWarning(message: string, options: vscode.MessageOptions, ...items: string[]): Thenable<string | undefined>;
  static showWarning<T extends vscode.MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>;
  static showWarning<T extends vscode.MessageItem>(message: string, options: vscode.MessageOptions, ...items: T[]): Thenable<T | undefined>;
  static showWarning(
    message: string,
    optionsOrItem?: vscode.MessageOptions | string | vscode.MessageItem,
    ...items: Array<string | vscode.MessageItem>
  ): Thenable<string | vscode.MessageItem | undefined> {
    this.logToOutput(message, "warn");
    this.logDebug(`User-visible warning: ${message}`);
    const resolved = this.resolveMessageArgs(optionsOrItem, items);
    return this.showWarningMessage(`${PREFIX}${message}`, resolved);
  }

  static logToOutput(message: string, type: LogType = "info"): void {
    const timestamp = new Date().toLocaleString();
    let prefix = "[INFO]";
    if (type === "error") {
      prefix = "[ERROR]";
    } else if (type === "warn") {
      prefix = "[WARN]";
    } else if (type === "success") {
      prefix = "[SUCCESS]";
    }
    this.ensureOutputChannel().appendLine(`[${timestamp}] ${prefix} ${message}`);
  }

  static isDebugModeEnabled(): boolean {
    return getCacheConfig<boolean>(this.DEBUG_CONFIG_KEY, false);
  }

  static logDebug(message: string): void {
    if (!this.isDebugModeEnabled()) return;
    this.logToOutput(`[debug] ${message}`);
  }

  static logCommandExecution(command: string, args: unknown[]): void {
    if (!this.isDebugModeEnabled()) return;
    const argsText = this.stringifyDebugPayload(args);
    this.logToOutput(`[debug] command executed: ${command}; args=${argsText}`);
  }

  private static stringifyDebugPayload(payload: unknown): string {
    try {
      const seen = new WeakSet<object>();
      const text = JSON.stringify(payload, (key, value: unknown) => {
        if (typeof key === "string" && /(api[_-]?key|token|secret|password|authorization)/i.test(key)) {
          return "***";
        }
        if (typeof value === "string") {
          return value.length > 120 ? `${value.slice(0, 117)}...` : value;
        }
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
        }
        return value;
      });
      if (text === undefined) return String(payload);
      return text.length > 500 ? `${text.slice(0, 497)}...` : text;
    } catch (error) {
      const fallback = error instanceof Error ? error.message : String(error);
      return `[Unserializable payload: ${fallback}]`;
    }
  }

  private static isMessageOptions(input: unknown): input is vscode.MessageOptions {
    if (typeof input !== "object" || input === null) return false;
    return Object.hasOwn(input, "modal") || Object.hasOwn(input, "detail");
  }

  private static resolveMessageArgs(
    optionsOrItem: vscode.MessageOptions | string | vscode.MessageItem | undefined,
    restItems: Array<string | vscode.MessageItem>
  ): { options?: vscode.MessageOptions; items: Array<string | vscode.MessageItem> } {
    if (this.isMessageOptions(optionsOrItem)) {
      return { options: optionsOrItem, items: restItems };
    }
    if (optionsOrItem === undefined) {
      return { items: [] };
    }
    return { items: [optionsOrItem, ...restItems] };
  }

  private static showInformation(
    message: string,
    resolved: { options?: vscode.MessageOptions; items: Array<string | vscode.MessageItem> }
  ): Thenable<string | vscode.MessageItem | undefined> {
    const stringItems = this.asStringItems(resolved.items);
    if (stringItems !== null) {
      if (resolved.options !== undefined) {
        return vscode.window.showInformationMessage(message, resolved.options, ...stringItems);
      }
      return vscode.window.showInformationMessage(message, ...stringItems);
    }
    const messageItems = this.asMessageItems(resolved.items);
    if (messageItems !== null) {
      if (resolved.options !== undefined) {
        return vscode.window.showInformationMessage(message, resolved.options, ...messageItems);
      }
      return vscode.window.showInformationMessage(message, ...messageItems);
    }
    if (resolved.options !== undefined) {
      return vscode.window.showInformationMessage(message, resolved.options);
    }
    return vscode.window.showInformationMessage(message);
  }

  private static showErrorMessage(
    message: string,
    resolved: { options?: vscode.MessageOptions; items: Array<string | vscode.MessageItem> }
  ): Thenable<string | vscode.MessageItem | undefined> {
    const stringItems = this.asStringItems(resolved.items);
    if (stringItems !== null) {
      if (resolved.options !== undefined) {
        return vscode.window.showErrorMessage(message, resolved.options, ...stringItems);
      }
      return vscode.window.showErrorMessage(message, ...stringItems);
    }
    const messageItems = this.asMessageItems(resolved.items);
    if (messageItems !== null) {
      if (resolved.options !== undefined) {
        return vscode.window.showErrorMessage(message, resolved.options, ...messageItems);
      }
      return vscode.window.showErrorMessage(message, ...messageItems);
    }
    if (resolved.options !== undefined) {
      return vscode.window.showErrorMessage(message, resolved.options);
    }
    return vscode.window.showErrorMessage(message);
  }

  private static showWarningMessage(
    message: string,
    resolved: { options?: vscode.MessageOptions; items: Array<string | vscode.MessageItem> }
  ): Thenable<string | vscode.MessageItem | undefined> {
    const stringItems = this.asStringItems(resolved.items);
    if (stringItems !== null) {
      if (resolved.options !== undefined) {
        return vscode.window.showWarningMessage(message, resolved.options, ...stringItems);
      }
      return vscode.window.showWarningMessage(message, ...stringItems);
    }
    const messageItems = this.asMessageItems(resolved.items);
    if (messageItems !== null) {
      if (resolved.options !== undefined) {
        return vscode.window.showWarningMessage(message, resolved.options, ...messageItems);
      }
      return vscode.window.showWarningMessage(message, ...messageItems);
    }
    if (resolved.options !== undefined) {
      return vscode.window.showWarningMessage(message, resolved.options);
    }
    return vscode.window.showWarningMessage(message);
  }

  private static asStringItems(items: Array<string | vscode.MessageItem>): string[] | null {
    if (items.every(item => typeof item === "string")) {
      return items;
    }
    return null;
  }

  private static asMessageItems(items: Array<string | vscode.MessageItem>): vscode.MessageItem[] | null {
    if (items.every(item => typeof item !== "string")) {
      return items;
    }
    return null;
  }
}
