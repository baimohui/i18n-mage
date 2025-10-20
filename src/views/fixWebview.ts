import * as vscode from "vscode";
import * as path from "path";
import { t } from "@/utils/i18n";
import { EntryIdPatches, LocaleMap } from "@/webviews/fix-preview/types";
import { I18nUpdatePayload } from "@/types";

type WebviewMessage = {
  type: "apply" | "cancel";
  data: {
    updatePayloads: I18nUpdatePayload[];
    idPatches: Record<string, number[]>;
  };
};

export default function launchFixWebview(
  context: vscode.ExtensionContext, // 添加 extensionContext 参数
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
      language: vscode.env.language
    })};
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
  text-align: right;
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
  for (const update of updates) {
    const payload = origin.find(p => p.key === update.key && p.type === update.type);
    if (payload) {
      for (const locale in payload.changes) {
        if (update.changes && Object.hasOwn(update.changes, locale)) {
          payload.changes[locale].after = update.changes[locale].after;
        } else {
          delete payload.changes[locale];
        }
      }
    }
  }
}

function applyIdPatches(origin: EntryIdPatches, patches: Record<string, number[]>): void {
  let fileIndex = 0;
  for (const file in origin) {
    if (patches[fileIndex] != null) {
      origin[file] = origin[file].filter((_, idx) => patches[fileIndex].includes(idx));
    } else {
      origin[file] = [];
    }
    fileIndex++;
  }

  // 清理空数组
  for (const file in origin) {
    if (origin[file].length === 0) {
      delete origin[file];
    }
  }
}
