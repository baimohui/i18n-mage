import * as vscode from "vscode";

let subscriptions: vscode.Disposable[] = [];

export function registerDisposable(disposable: vscode.Disposable) {
  subscriptions.push(disposable);
}

export function bindDisposablesToContext(context: vscode.ExtensionContext) {
  subscriptions.forEach(d => context.subscriptions.push(d));
  subscriptions = []; // 防止重复
}
