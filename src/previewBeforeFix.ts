import * as vscode from "vscode";
import { TEntry } from "./types";

type ValueFixes = Record<string, Record<string, string | undefined>>;
type IdFixes = Record<string, TEntry[]>;
type LangCountryMap = Record<string, Record<string, string>>;

function getWebviewContent(
  valueFixes: ValueFixes,
  idFixes: IdFixes,
  langCountryMap: LangCountryMap,
  referredLang: string
): string {
  const nonce = getNonce();

  const valueSections = Object.entries(valueFixes)
    .map(([lang, entryInfo]) => {
      const items = Object.entries(entryInfo)
        .map(
          ([name, value]) => `
      <div class="entry" data-lang="${lang}" data-id="${name}">
        <input type="checkbox" id="value_${name}" class="value-checkbox" checked>
        <label>${name}</label>
        <input type="text" class="value-input" value="${value}">
        ${
          langCountryMap[lang][name] && langCountryMap[lang][name] !== value
            ? `<div class="old-value">${langCountryMap[lang][name]}</div>`
            : ""
        }
        ${
          !langCountryMap[lang][name] && langCountryMap[referredLang][name]
            ? `<div class="refer-value">${langCountryMap[referredLang][name]}</div>`
            : ""
        }
      </div>
    `
        )
        .join("");
      return `
      <div class="lang-section">
        <h4>${lang}</h4>
        ${items}
      </div>
    `;
    })
    .join("");

  const idSections = Object.entries(idFixes)
    .map(([file, changes]) => {
      const items = changes
        .map(
          (change, index) => `
      <div class="id-change">
        <input type="checkbox" data-file="${file}" data-index="${index}" id="idfix_${change.id}" class="idfix-checkbox" checked>
        <label><span class="old-id">${change.raw}</span> → <span class="new-id">${change.fixedRaw}</span></label>
      </div>
    `
        )
        .join("");
      return `
      <div class="file-section">
        <h4>${file}</h4>
        ${items}
      </div>
    `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
      <title>修复内容确认</title>
      <style>
        body {
          font-family: var(--vscode-font-family, sans-serif);
          padding: 20px;
          background-color: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
        }
        h2, h3, h4 {
          color: var(--vscode-editor-foreground);
        }
        .section {
          margin-bottom: 30px;
          background: #fff;
          padding: 20px;
          border-radius: 12px;
          background: var(--vscode-sideBar-background);
          border: 1px solid var(--vscode-editorWidget-border);
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }
        .entry {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .entry label {
          width: 200px;  
          flex-shrink: 0;
        }
        .entry, .id-change {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
        }
        .entry input[type="text"] {
          flex: 3;
          padding: 6px 10px;
          border-radius: 6px;
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
        }
        .old-value {
          flex: 2;
          color: red;
          font-size: 0.9em;
        }
        .refer-value {
          flex: 2;
          font-size: 0.9em;
        }
        .old-id {
          color: red;
        }
        .new-id {
          color: green;
        }
        button {
          margin-right: 10px;
          padding: 10px 20px;
          font-size: 1em;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }
        #applyBtn {
          background-color: #007acc;
          color: white;
        }
        #cancelBtn {
          background-color: #ccc;
          color: #333;
        }
        button:hover {
          background-color: var(--vscode-button-hoverBackground);
        }
        button:active {
          background-color: var(--vscode-button-activeBackground);
        }
      </style>
    </head>
    <body>
      <h2>确认要应用以下修复内容</h2>

      <div class="section" style="display: ${Object.keys(valueFixes).length ? "block" : "none"};">
        <h3>词条值更新</h3>
        ${valueSections}
      </div>

      <div class="section" style="display: ${Object.keys(idFixes).length ? "block" : "none"};">
        <h3>词条 ID 修正</h3>
        ${idSections}
      </div>

      <button id="applyBtn">应用</button>
      <button id="cancelBtn">取消</button>

      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        document.querySelectorAll('.value-input').forEach(input => {
          input.addEventListener('input', () => {
            const checkbox = input.parentElement.querySelector('.value-checkbox');
            checkbox.checked = input.value.trim() !== '';
            checkbox.disabled = input.value.trim() === '';
          });
        });

        document.getElementById('applyBtn')?.addEventListener('click', () => {
          const valueFixes = {};
          document.querySelectorAll('.entry').forEach(entry => {
            const id = entry.dataset.id;
            const checkbox = entry.querySelector('.value-checkbox');
            const input = entry.querySelector('.value-input');
            if (checkbox.checked) {
              const lang = entry.dataset.lang;
              if (!valueFixes[lang]) {
                valueFixes[lang] = {};
              }
              valueFixes[lang][id] = input.value;
            }
          });

          const idFixes = {};
          document.querySelectorAll('.idfix-checkbox').forEach(cb => {
            if (cb.checked) {
              const file = cb.dataset.file;
              const index = cb.dataset.index;
              if (!idFixes[file]) {
                idFixes[file] = [];
              }
              idFixes[file].push(index);
            }
          });

          vscode.postMessage({
            type: 'applyFixes',
            data: { valueFixes, idFixes }
          });
        });

        document.getElementById('cancelBtn')?.addEventListener('click', () => {
          vscode.postMessage({ type: 'cancelFixes' });
        });
      </script>
    </body>
    </html>
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

export default async function (
  updatedEntryValueInfo: ValueFixes,
  patchedEntryIdInfo: IdFixes,
  langCountryMap: LangCountryMap,
  referredLang: string,
  callback: () => void
): Promise<void> {
  const panel = vscode.window.createWebviewPanel("fixProblems", "选择要应用的修复", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: false
  });

  panel.webview.html = getWebviewContent(updatedEntryValueInfo, patchedEntryIdInfo, langCountryMap, referredLang);

  panel.webview.onDidReceiveMessage(message => {
    if (message.type === "applyFixes") {
      const { valueFixes, idFixes } = message.data;
      for (const lang in updatedEntryValueInfo) {
        if (valueFixes[lang]) {
          for (const id in updatedEntryValueInfo[lang]) {
            if (valueFixes[lang][id]) {
              updatedEntryValueInfo[lang][id] = valueFixes[lang][id];
            } else {
              delete updatedEntryValueInfo[lang][id];
            }
          }
        } else {
          delete updatedEntryValueInfo[lang];
        }
      }
      for (const filePath in patchedEntryIdInfo) {
        patchedEntryIdInfo[filePath] = patchedEntryIdInfo[filePath].filter((_, index) => !idFixes[filePath]?.includes(index));
      }
      panel.dispose();
      callback();
    } else if (message.type === "cancelFixes") {
      console.log("用户取消了修复操作");
      panel.dispose();
    }
  });
}
