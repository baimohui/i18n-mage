import * as vscode from "vscode";
import { ExecutionContext } from "./context";

/**
 * VS Code 信息通知管理器
 */
export class NotificationManager {
  private static outputChannel: vscode.OutputChannel;

  // 初始化输出通道
  static init() {
    this.outputChannel = vscode.window.createOutputChannel("LangMage");
  }

  // 显示主标题
  static showTitle(title: string): void {
    const divider = "=".repeat(title.length + 4);
    this.outputChannel.appendLine(`\n${divider}`);
    this.outputChannel.appendLine(`  ${title}  `);
    this.outputChannel.appendLine(`${divider}\n`);
    vscode.window.setStatusBarMessage(`LangMage: ${title}`, 3000);
  }

  // 进度信息
  static showProgress(message: string): void {
    try {
      ExecutionContext.progress?.report({ message });
    } catch {
      vscode.window.setStatusBarMessage(message, 2000);
    }
    this.logToOutput(`⏳ ${message}`);
  }

  // 成功信息
  static showSuccess(message: string, ...items: string[]): void {
    vscode.window.showInformationMessage(`${message}`, ...items);
    vscode.window.setStatusBarMessage(`${message}`, 3000);
    this.logToOutput(`✅ ${message}`);
  }

  // 错误信息
  static showError(message: string, ...items: string[]): void {
    vscode.window.showErrorMessage(`${message}`, ...items);
    this.outputChannel.show();
    this.logToOutput(`❌ ${message}`, "error");
  }

  // 警告信息
  static showWarning(message: string, ...items: string[]): void {
    vscode.window.showWarningMessage(`${message}`, ...items);
    this.logToOutput(`⚠️ ${message}`, "warn");
  }

  // 记录到输出通道
  private static logToOutput(message: string, type: "info" | "warn" | "error" = "info"): void {
    const timestamp = new Date().toLocaleString();
    const prefix = type === "error" ? "[ERROR] " : type === "warn" ? "[WARN]  " : "[INFO]  ";
    this.outputChannel.appendLine(`[${timestamp}] ${prefix}${message}`);
  }
}
