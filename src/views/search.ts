import * as vscode from "vscode";
import { t } from "../utils/i18n";

export class SearchProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "i18nMage.searchView";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _onSearch: (filter: { text: string; scope: string[] }) => void
  ) {}

  public focus() {
    if (this._view) {
      this._view.show(true);
      this._view.webview.postMessage({ type: "focus" });
    }
  }

  public resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((data: { type: string; value: { text: string; scope: string[] } }) => {
      switch (data.type) {
        case "search": {
          this._onSearch(data.value);
          break;
        }
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const nonce = getNonce();

    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Search</title>
                <style>
                    body { padding: 10px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
                    .search-box {
                        display: flex;
                        gap: 4px;
                        align-items: center;
                        background-color: var(--vscode-input-background);
                        border: 1px solid var(--vscode-input-border);
                        color: var(--vscode-input-foreground);
                        padding: 2px 4px;
                    }
                    .search-box:focus-within {
                        border-color: var(--vscode-focusBorder);
                    }
                    input {
                        width: 100%;
                        background: transparent;
                        border: none;
                        outline: none;
                        color: inherit;
                        padding: 4px;
                    }
                    .scopes {
                        margin-top: 8px;
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .scope-item {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        font-size: 0.9em;
                        cursor: pointer;
                    }
                    .scope-item input {
                        width: auto;
                        margin: 0;
                    }
                </style>
			</head>
			<body>
				<div class="search-box">
                    <input type="text" id="search-input" placeholder="${t("content.search.placeholder") || "Search..."}" />
                </div>
                <div class="scopes">
                    <label class="scope-item"><input type="checkbox" value="defined" checked> ${t("tree.currentFile.defined")}</label>
                    <label class="scope-item"><input type="checkbox" value="undefined" checked> ${t("tree.currentFile.undefined")}</label>
                    <label class="scope-item"><input type="checkbox" value="used" checked> ${t("tree.usedInfo.used")}</label>
                    <label class="scope-item"><input type="checkbox" value="unused" checked> ${t("tree.usedInfo.unused")}</label>
                </div>
				<script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    const input = document.getElementById('search-input');
                    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                    
                    function triggerSearch() {
                        const text = input.value;
                        const scope = Array.from(checkboxes)
                            .filter(cb => cb.checked)
                            .map(cb => cb.value);
                        vscode.setState({ text, scope });
                        vscode.postMessage({ type: 'search', value: { text, scope } });
                    }

                    const state = vscode.getState();
                    if (state) {
                        input.value = state.text || '';
                        if (state.scope) {
                            checkboxes.forEach(cb => {
                                cb.checked = state.scope.includes(cb.value);
                            });
                        }
                        triggerSearch();
                    }

                    input.addEventListener('input', triggerSearch);
                    checkboxes.forEach(cb => cb.addEventListener('change', triggerSearch));

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'focus':
                                input.focus();
                                break;
                        }
                    });
                </script>
			</body>
			</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
