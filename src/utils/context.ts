import * as vscode from "vscode";

/**
 * VS Code 执行上下文管理（Progress + CancellationToken）
 */
export class ExecutionContext {
  private static _current: {
    progress?: vscode.Progress<{ message?: string }>;
    token?: vscode.CancellationToken;
  } = {};

  static bind(progress: vscode.Progress<{ message?: string }>, token: vscode.CancellationToken) {
    this._current = { progress, token };
  }

  static unbind() {
    this._current = {};
  }

  static get progress(): vscode.Progress<{ message?: string }> {
    if (!this._current.progress) throw new Error("Progress not bound");
    return this._current.progress;
  }

  static get token(): vscode.CancellationToken {
    if (!this._current.token) throw new Error("CancellationToken not bound");
    return this._current.token;
  }
}
