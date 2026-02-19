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
  panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, "images", "icon.png"));

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
  <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
</body>
</html>`;
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
