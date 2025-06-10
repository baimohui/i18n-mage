import * as vscode from "vscode";

const subscriptions: vscode.Disposable[] = [];

export function registerDisposable(disposable: vscode.Disposable) {
  subscriptions.push(disposable);
}

export function bindDisposablesToContext(context: vscode.ExtensionContext) {
  subscriptions.forEach(d => context.subscriptions.push(d));
  return subscriptions.splice(0); // 清空防止重复
}
