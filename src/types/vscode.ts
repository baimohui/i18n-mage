import * as vscode from "vscode";

export interface PluginConfiguration extends vscode.WorkspaceConfiguration {
  referenceLanguage: string;
  ignoredFileList: string[];
  langFileMinLength: number;
  ignoreEmptyLangFile: boolean;
  sortWithTrim: boolean;
  baiduAppId: string;
  baiduSecretKey: string;
  tencentSecretId: string;
  tencentSecretKey: string;
  translateApiPriority: string[];
  syncBasedOnReferredEntries: boolean;
  previewBeforeFix: boolean;
}
