import * as vscode from "vscode";
import * as path from "path";
import { t } from "@/utils/i18n";
import { EntryIdPatches, LocaleMap } from "@/webviews/fix-preview/types";
import { I18nUpdatePayload } from "@/types";
import { internalToDisplayName, unescapeString } from "@/utils/regex";
import { getConfig } from "@/utils/config";
import { I18nFramework } from "@/types/config";

type WebviewMessage = {
  type: "apply" | "cancel";
  data: {
    updatePayloads: I18nUpdatePayload[];
    idPatches: EntryIdPatches;
  };
};

export default function launchFixWebview(
  context: vscode.ExtensionContext,
  updatePayloads: I18nUpdatePayload[],
  idPatches: EntryIdPatches,
  localeMap: LocaleMap,
  baseLocale: string,
  onComplete: () => Promise<void>,
  onCancel: () => Promise<void>
) {
  const panel = vscode.window.createWebviewPanel("fixProblems", t("preview.title"), vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "dist", "webviews"))]
  });

  updatePayloads.forEach(payload => {
    payload.name = getDisplayName(payload.key);
  });

  const webviewHtml = buildWebviewHtml(context, panel.webview, {
    updatePayloads,
    idPatches,
    localeMap,
    baseLocale
  });
  panel.webview.html = webviewHtml;

  panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
    if (msg.type === "apply") {
      applyValueUpdates(updatePayloads, msg.data.updatePayloads);
      applyIdPatches(idPatches, msg.data.idPatches);
      panel.dispose();
      await onComplete();
    } else {
      panel.dispose();
      await onCancel();
    }
  });

  panel.reveal(vscode.ViewColumn.One);
}

function getDisplayName(key: string) {
  return internalToDisplayName(unescapeString(key));
}

function buildWebviewHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  data: {
    updatePayloads: I18nUpdatePayload[];
    idPatches: EntryIdPatches;
    localeMap: LocaleMap;
    baseLocale: string;
  }
): string {
  const nonce = getNonce();

  // 获取构建后的 JS 文件路径
  const scriptPath = vscode.Uri.file(path.join(context.extensionPath, "dist", "webviews", "fix-preview.js"));
  const scriptSrc = webview.asWebviewUri(scriptPath).toString();

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t("preview.title")}</title>
  <style>
    ${getStyles()}
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    // 将数据传递给 Preact 应用
    window.webviewData = ${JSON.stringify({
      ...data,
      language: vscode.env.language,
      displayNameConfig: {
        framework: getConfig<I18nFramework>("i18nFeatures.framework", "auto"),
        defaultNamespace: getConfig<string>("i18nFeatures.defaultNamespace", "translation"),
        namespaceSeparator: getConfig<"." | ":" | "auto">("i18nFeatures.namespaceSeparator", "auto")
      }
    })};

    // 确保 webview 获得焦点，以便能够监听键盘事件
    const acquireVsCodeApi = (function() {
      const originalPostMessage = window.parent.postMessage.bind(window.parent);
      return {
        postMessage: function(message) {
          originalPostMessage({ command: message }, '*');
        }
      };
    })();

    // 在 webview 加载完成后主动获取焦点
    window.addEventListener('load', function() {
      // 短暂延迟确保 webview 完全加载
      setTimeout(function() {
        // 尝试多种方式获取焦点
        document.body.focus();
        window.focus();

        // 添加一个可聚焦的元素并获取焦点
        const focusElement = document.createElement('div');
        focusElement.setAttribute('tabindex', '0');
        focusElement.style.position = 'absolute';
        focusElement.style.opacity = '0';
        focusElement.style.width = '0';
        focusElement.style.height = '0';
        document.body.appendChild(focusElement);
        focusElement.focus();
      }, 100);
    });
  </script>
  <script nonce="${nonce}" src="${scriptSrc}"></script>
</body>
</html>`;
}

function getStyles(): string {
  return `
:root {
  --bg: var(--vscode-sideBar-background);
  --fg: var(--vscode-editor-foreground);
  --input-bg: var(--vscode-input-background);
  --input-fg: var(--vscode-input-foreground);
  --border: var(--vscode-input-border);
  --btn-bg: var(--vscode-button-background);
  --btn-fg: var(--vscode-button-foreground);
  --btn-hover: var(--vscode-button-hoverBackground);
}

body {
  font-family: var(--vscode-font-family);
  padding: 20px;
  color: var(--fg);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  margin: 0;
}

h1,
h2 {
  margin-bottom: 12px;
}

.content {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 24px;
}

details {
  margin-bottom: 24px;
}

.section {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}

.section:not(:last-child) {
  margin-bottom: 16px;
}

.section h2 {
  margin-top: 0;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-bottom: 12px;
  position: relative;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
}

textarea {
  resize: vertical;
}

.item input[type="text"], .item textarea {
  flex: 3;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--input-fg);
}

.value-updates .item label {
  width: 200px;
  flex-shrink: 0;
  word-wrap: break-word;
}

.item span {
  flex: 2;
  font-size: 0.9em;
}

.old {
  color: #c00;
}

.new {
  color: #090;
}

.actions {
  text-align: left;
  position: sticky;
  bottom: 0;
  background: var(--bg);
  padding: 16px 0;
  border-top: 1px solid var(--border);
}

#countDisplay {
  margin-right: 16px;
  font-weight: bold;
}

button {
  margin-left: 8px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: var(--btn-bg);
  color: var(--btn-fg);
}

button:hover {
  background: var(--btn-hover);
}

#btn-apply {
  background: #007acc;
  color: #fff;
}

#btn-apply:disabled {
  background: #888 !important;
  color: #ccc !important;
  cursor: not-allowed;
}

#btn-cancel {
  background: #ccc;
  color: #333;
}

details summary {
  list-style-type: none;
}

details summary::-webkit-details-marker {
  display: none;
}

details summary::before {
  content: "";
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-left: 0.6em solid currentColor;
  border-top: 0.6em solid transparent;
  border-bottom: 0.6em solid transparent;
  transition: transform 0.2s;
}

details[open] summary::before {
  transform: translateY(-50%) rotate(90deg);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.toolbar select {
  min-width: 220px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--input-fg);
}

.entry-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: var(--bg);
}

.entry-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.kind-tag {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 12px;
}

.key-input,
.key-code {
  flex: 1;
}

.key-input {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--input-fg);
}

.key-input.invalid,
textarea.invalid {
  border-color: var(--vscode-inputValidation-errorBorder, #c00);
}

.field-error {
  color: var(--vscode-inputValidation-errorForeground, #c00);
  font-size: 12px;
  margin-top: -6px;
  margin-bottom: 8px;
}

.key-code {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--vscode-editor-background);
}

.entry-block {
  margin-top: 8px;
}

.block-title {
  font-weight: 600;
  margin-bottom: 8px;
}

.patch-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
}

.app .content {
  flex: 1;
  overflow-y: auto;
}

.app .actions {
  flex-shrink: 0;
}
`;
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function applyValueUpdates(origin: I18nUpdatePayload[], updates: I18nUpdatePayload[]): void {
  origin.splice(0, origin.length, ...updates);
}

function applyIdPatches(origin: EntryIdPatches, patches: EntryIdPatches): void {
  Object.keys(origin).forEach(file => {
    delete origin[file];
  });
  Object.entries(patches).forEach(([file, entries]) => {
    if (entries.length > 0) {
      origin[file] = entries;
    }
  });
}
