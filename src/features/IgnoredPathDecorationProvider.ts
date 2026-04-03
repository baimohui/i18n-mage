import * as vscode from "vscode";
import { getIgnoredPathsFromCache } from "@/utils/ignorePaths";
import { isSamePath } from "@/utils/fs";
import { t } from "@/utils/i18n";

export class IgnoredPathDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private static instance: IgnoredPathDecorationProvider | null = null;
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.emitter.event;

  static getInstance(): IgnoredPathDecorationProvider {
    if (!IgnoredPathDecorationProvider.instance) {
      IgnoredPathDecorationProvider.instance = new IgnoredPathDecorationProvider();
    }
    return IgnoredPathDecorationProvider.instance;
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const ignoredPaths = getIgnoredPathsFromCache();
    const isIgnored = ignoredPaths.some(item => isSamePath(uri.fsPath, item));
    if (!isIgnored) return undefined;
    return {
      badge: "👻",
      tooltip: t("common.ignoredPathDecoration"),
      color: new vscode.ThemeColor("gitDecoration.ignoredResourceForeground")
    };
  }

  refresh(target?: vscode.Uri | vscode.Uri[]) {
    this.emitter.fire(target);
  }

  dispose() {
    this.emitter.dispose();
  }
}
