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
  --bg: var(--vscode-editor-background);
  --panel: color-mix(in srgb, var(--vscode-editorWidget-background) 84%, var(--bg));
  --panel-soft: color-mix(in srgb, var(--vscode-editorWidget-background) 60%, var(--bg));
  --fg: var(--vscode-editor-foreground);
  --muted: var(--vscode-descriptionForeground);
  --input-bg: var(--vscode-input-background);
  --input-fg: var(--vscode-input-foreground);
  --border: color-mix(in srgb, var(--vscode-input-border) 70%, var(--vscode-panel-border));
  --ring: var(--vscode-focusBorder);
  --btn-bg: var(--vscode-button-background);
  --btn-fg: var(--vscode-button-foreground);
  --btn-hover: var(--vscode-button-hoverBackground);
  --danger: var(--vscode-inputValidation-errorBorder, #c00);
  --danger-fg: var(--vscode-inputValidation-errorForeground, #c00);
  --success: var(--vscode-terminal-ansiGreen, #00a86b);
  --warn: var(--vscode-terminal-ansiRed, #d14343);
  --radius: 12px;
}

body {
  font-family: var(--vscode-font-family, "Segoe UI", sans-serif);
  padding: 16px;
  color: var(--fg);
  background:
    radial-gradient(1200px 420px at -10% -20%, color-mix(in srgb, var(--btn-bg) 14%, transparent), transparent 60%),
    radial-gradient(900px 300px at 110% -15%, color-mix(in srgb, var(--vscode-terminal-ansiGreen) 10%, transparent), transparent 62%),
    var(--bg);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  margin: 0;
  min-height: 100vh;
  overflow: hidden;
}

h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
  letter-spacing: 0.2px;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding-right: 2px;
  margin-top: 6px;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  display: grid;
  grid-template-columns: auto 72px minmax(220px, 1fr) auto minmax(120px, 34%);
  align-items: center;
  gap: 8px 10px;
  background: var(--panel-soft);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
}

.value-item {
  grid-template-columns: auto 72px minmax(220px, 1fr) auto minmax(120px, 34%);
}

.patch-item {
  grid-template-columns: auto minmax(280px, 1fr);
}

.patch-item .patch-label {
  grid-column: 2;
}

textarea {
  resize: vertical;
  min-height: 30px;
  line-height: 1.3;
  min-width: 0;
}

input[type="text"],
select {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--input-fg);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.value-item textarea {
  width: 100%;
  max-width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--input-fg);
  outline: none;
  box-sizing: border-box;
}

input[type="text"]:focus,
textarea:focus,
select:focus {
  border-color: var(--ring);
  box-shadow: 0 0 0 1px var(--ring);
}

.item span {
  font-size: 12px;
  color: var(--muted);
  overflow-wrap: anywhere;
  min-width: 0;
}

.old {
  color: var(--warn);
}

.new {
  color: var(--success);
}

.actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  position: sticky;
  bottom: 0;
  background: linear-gradient(to top, var(--bg) 70%, transparent);
  padding: 12px 0 4px;
  border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

#countDisplay {
  margin-right: 8px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

button {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  cursor: pointer;
  background: var(--panel-soft);
  color: var(--fg);
  transition: transform 0.12s ease, background-color 0.16s ease, border-color 0.16s ease;
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--panel-soft) 70%, var(--btn-bg));
}

#btn-apply:disabled {
  background: color-mix(in srgb, var(--panel) 80%, transparent) !important;
  color: color-mix(in srgb, var(--fg) 55%, transparent) !important;
  cursor: not-allowed;
  border-color: color-mix(in srgb, var(--border) 50%, transparent);
}

.btn-primary {
  background: var(--btn-bg);
  color: var(--btn-fg);
  border-color: color-mix(in srgb, var(--btn-bg) 70%, var(--border));
}

.btn-primary:hover:not(:disabled) {
  background: var(--btn-hover);
}

.btn-secondary {
  background: var(--panel-soft);
}

.filters-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--panel) 72%, var(--panel-soft));
  padding: 9px 10px;
}

.filter-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 10px;
  align-items: start;
  padding: 2px 0;
}

.filter-row + .filter-row {
  margin-top: 0;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
}

.filter-label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-top: 6px;
}

.filter-select {
  max-width: 360px;
  background: var(--input-bg) !important;
  color: var(--input-fg) !important;
  border: 1px solid var(--border) !important;
  appearance: none;
  -webkit-appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, color-mix(in srgb, var(--input-fg) 72%, transparent) 50%),
    linear-gradient(135deg, color-mix(in srgb, var(--input-fg) 72%, transparent) 50%, transparent 50%);
  background-position:
    calc(100% - 16px) calc(50% - 2px),
    calc(100% - 10px) calc(50% - 2px);
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
  padding-right: 28px;
}

.filter-select option {
  background: var(--input-bg);
  color: var(--input-fg);
}

.locale-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.locale-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--panel-soft);
  font-size: 12px;
  font-weight: 600;
}

.entry-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  margin-bottom: 12px;
  background: var(--panel);
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--border) 70%, transparent),
    0 10px 24px color-mix(in srgb, var(--bg) 80%, black 12%);
  position: relative;
  overflow: clip;
  animation: cardIn 220ms ease both;
}

.entry-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: color-mix(in srgb, var(--btn-bg) 72%, var(--border));
}

.entry-card.kind-new-key-and-patch::before {
  background: color-mix(in srgb, var(--vscode-terminal-ansiGreen) 78%, var(--border));
}

.entry-card.kind-patch-existing-key::before {
  background: color-mix(in srgb, var(--vscode-terminal-ansiBlue) 78%, var(--border));
}

.entry-card.kind-fill-missing::before {
  background: color-mix(in srgb, var(--vscode-terminal-ansiYellow) 78%, var(--border));
}

.entry-card.kind-import-edit::before {
  background: color-mix(in srgb, var(--vscode-terminal-ansiCyan) 78%, var(--border));
}

.entry-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.kind-tag {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--btn-bg) 55%, var(--border));
  background: color-mix(in srgb, var(--btn-bg) 16%, transparent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.15px;
}

.kind-tag.kind-new-key-and-patch {
  background: color-mix(in srgb, var(--vscode-terminal-ansiGreen) 22%, transparent);
}

.kind-tag.kind-patch-existing-key {
  background: color-mix(in srgb, var(--vscode-terminal-ansiBlue) 22%, transparent);
}

.kind-tag.kind-fill-missing {
  background: color-mix(in srgb, var(--vscode-terminal-ansiYellow) 22%, transparent);
}

.kind-tag.kind-import-edit {
  background: color-mix(in srgb, var(--vscode-terminal-ansiCyan) 20%, transparent);
}

.key-input,
.key-code {
  flex: 1;
}

.key-input.invalid,
textarea.invalid {
  border-color: var(--danger);
  box-shadow: 0 0 0 1px var(--danger);
}

.field-error {
  color: var(--danger-fg);
  font-size: 12px;
  margin-top: -4px;
  margin-bottom: 8px;
  padding-left: 28px;
  font-weight: 600;
}

.key-code {
  display: inline-block;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--border);
  font-size: 12px;
}

.entry-block {
  margin-top: 10px;
}

.entry-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  padding-left: 26px;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--panel-soft);
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid var(--border);
  white-space: nowrap;
}

.status-empty {
  background: color-mix(in srgb, var(--warn) 14%, transparent);
  color: var(--warn);
}

.status-localeFiltered {
  background: color-mix(in srgb, var(--vscode-terminal-ansiBlue) 14%, transparent);
  color: var(--vscode-terminal-ansiBlue);
}

.diff-inline {
  font-size: 12px;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.diff-removed {
  text-decoration: line-through;
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 14%, transparent);
  border-radius: 4px;
  padding: 0 2px;
}

.diff-added {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
  border-radius: 4px;
  padding: 0 2px;
}

.block-title {
  font-weight: 700;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.35px;
}

.patch-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.card-toggle {
  margin-left: auto;
  padding: 5px 10px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--panel-soft);
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15px;
}

.card-toggle:hover {
  color: var(--fg);
}

.patch-label strong {
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.patch-diff {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.patch-arrow {
  color: var(--muted);
  font-weight: 700;
}

.patch-diff .old,
.patch-diff .new {
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
}

.patch-diff .old {
  background: color-mix(in srgb, var(--warn) 24%, transparent);
  color: color-mix(in srgb, var(--warn) 84%, white 10%);
}

.patch-diff .new {
  background: color-mix(in srgb, var(--success) 24%, transparent);
  color: color-mix(in srgb, var(--success) 86%, white 8%);
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
  scrollbar-gutter: stable;
}

.app .actions {
  flex-shrink: 0;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

label {
  overflow-wrap: anywhere;
}

input[type="checkbox"] {
  inline-size: 14px;
  block-size: 14px;
  accent-color: var(--btn-bg);
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: 1px solid var(--ring);
  outline-offset: 1px;
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 880px) {
  .item {
    grid-template-columns: auto 1fr;
    grid-template-areas:
      "check locale"
      "check input"
      "check status"
      "check side";
  }

  .item > input[type="checkbox"] {
    grid-area: check;
    align-self: start;
    margin-top: 3px;
  }

  .item > label {
    grid-area: locale;
  }

  .item > textarea {
    grid-area: input;
  }

  .item > .status-badge {
    grid-area: status;
  }

  .item > span:last-child {
    grid-area: side;
  }

  .entry-head {
    flex-wrap: wrap;
  }

  .kind-tag {
    order: 3;
  }

  .filter-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .filter-label {
    padding-top: 0;
  }
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
