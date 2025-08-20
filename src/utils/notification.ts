import * as vscode from "vscode";
import { ExecutionContext } from "./context";
import { ExecutionResult } from "@/types";

const PREFIX = "i18n Mage 🪄 ";
/**
 * VS Code 信息通知管理器
 */
export class NotificationManager {
  private static outputChannel: vscode.OutputChannel;

  // 初始化输出通道
  static init() {
    this.outputChannel = vscode.window.createOutputChannel("i18n Mage");
  }

  static showOutputChannel() {
    this.outputChannel.show();
  }

  static setStatusBarMessage(message: string, time: number = 3000) {
    vscode.window.setStatusBarMessage(`🧙 ${message}`, time);
  }

  // 显示主标题
  static showTitle(title: string): void {
    const divider = "=".repeat(title.length + 4);
    this.outputChannel.appendLine(`\n${divider}`);
    this.outputChannel.appendLine(`  ${title}  `);
    this.outputChannel.appendLine(`${divider}\n`);
    NotificationManager.setStatusBarMessage(title);
  }

  // 进度信息
  static showProgress(data: { message?: string; type?: "info" | "warn" | "error" | "success"; increment?: number }): void {
    if (data.message !== undefined) {
      this.logToOutput(data.message, data.type);
    }
    ExecutionContext.progress?.report(data);
  }

  static hideProgress(): void {
    ExecutionContext.progress?.report({ message: "" });
  }

  static showResult(result: ExecutionResult, ...items: string[]): Thenable<string | undefined> {
    const typeNum = Math.floor(result.code / 100);
    // this.logToOutput(`📢 code: ${result.code}`);
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

  // 成功信息
  static showSuccess(message: string, ...items: string[]): Thenable<string | undefined> {
    NotificationManager.setStatusBarMessage(`${message}`);
    this.logToOutput(message, "success");
    return vscode.window.showInformationMessage(`${PREFIX}${message}`, ...items);
  }

  // 错误信息
  static showError(message: string, ...items: string[]): Thenable<string | undefined> {
    this.outputChannel.show();
    this.logToOutput(message, "error");
    return vscode.window.showErrorMessage(`${PREFIX}${message}`, ...items);
  }

  // 警告信息
  static showWarning(message: string, ...items: string[]): Thenable<string | undefined> {
    this.logToOutput(message, "warn");
    return vscode.window.showWarningMessage(`${PREFIX}${message}`, ...items);
  }

  // 记录到输出通道
  static logToOutput(message: string, type: "success" | "warn" | "error" | "info" = "info"): void {
    const timestamp = new Date().toLocaleString();
    // let prefix = "[INFO]  ⏳ ";
    let prefix = "⏳";
    if (type === "error") {
      prefix = "❌";
    } else if (type === "warn") {
      prefix = "⚠️";
    } else if (type === "success") {
      prefix = "✅";
    }
    this.outputChannel.appendLine(`[${timestamp}] ${prefix}${message}`);
  }
}
