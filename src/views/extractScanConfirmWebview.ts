import * as vscode from "vscode";
import * as path from "path";
import { t } from "@/utils/i18n";
import { ExtractCandidate } from "@/core/extract/types";
import { toRelativePath } from "@/utils/fs";

type WebviewMessage =
  | { type: "confirm"; data: { selectedIds: string[]; addedIgnoreFiles: string[]; addedIgnoreTexts: string[] } }
  | { type: "back"; data: { addedIgnoreFiles: string[]; addedIgnoreTexts: string[] } }
  | { type: "cancel" };

type ScanConfirmResult =
  | { type: "confirm"; selectedIds: string[]; addedIgnoreFiles: string[]; addedIgnoreTexts: string[] }
  | { type: "back"; addedIgnoreFiles: string[]; addedIgnoreTexts: string[] }
  | { type: "cancel" };

export default function launchExtractScanConfirmWebview(
  context: vscode.ExtensionContext,
  candidates: ExtractCandidate[],
  writeLanguages: string[]
): Promise<ScanConfirmResult> {
  return new Promise(resolve => {
    const panel = vscode.window.createWebviewPanel("extractScanConfirm", t("extractScanConfirm.title"), vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "dist", "webviews"))]
    });
    panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, "images", "icon.png"));

    panel.webview.html = buildWebviewHtml(context, panel.webview, candidates, writeLanguages);
    let settled = false;
    panel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
      if (msg.type === "confirm") {
        settled = true;
        panel.dispose();
        resolve({
          type: "confirm",
          selectedIds: msg.data.selectedIds,
          addedIgnoreFiles: msg.data.addedIgnoreFiles,
          addedIgnoreTexts: msg.data.addedIgnoreTexts
        });
      } else if (msg.type === "back") {
        settled = true;
        panel.dispose();
        resolve({
          type: "back",
          addedIgnoreFiles: msg.data.addedIgnoreFiles,
          addedIgnoreTexts: msg.data.addedIgnoreTexts
        });
      } else {
        settled = true;
        panel.dispose();
        resolve({ type: "cancel" });
      }
    });

    panel.onDidDispose(() => {
      if (!settled) resolve({ type: "cancel" });
    });

    panel.reveal(vscode.ViewColumn.One);
  });
}

function buildWebviewHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  candidates: ExtractCandidate[],
  writeLanguages: string[]
) {
  const nonce = getNonce();
  const scriptPath = vscode.Uri.file(path.join(context.extensionPath, "dist", "webviews", "extract-scan-confirm.js"));
  const scriptSrc = webview.asWebviewUri(scriptPath).toString();

  const normalized = candidates.map(item => ({
    ...item,
    file: toRelativePath(item.file)
  }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t("extractScanConfirm.title")}</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.webviewData = ${JSON.stringify({
      language: vscode.env.language,
      writeLanguages,
      candidates: normalized
    }).replace(/</g, "\\u003c")};
    window.addEventListener('load', function() {
      setTimeout(function() {
        document.body.setAttribute('tabindex', '-1');
        document.body.focus();
        window.focus();

        const root = document.getElementById('root');
        if (root) {
          root.setAttribute('tabindex', '-1');
          root.focus();
        }

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
  <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
</body>
</html>`;
}

function getNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
