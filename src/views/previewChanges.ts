import * as vscode from "vscode";
import { FixedTEntry } from "@/types";
import { t } from "@/utils/i18n";
import { unescapeString, internalToDisplayName } from "@/utils/regex";
import { toRelativePath } from "@/utils/fs";

type EntryValueUpdates = Record<string, Record<string, string | undefined>>;
type EntryIdPatches = Record<string, FixedTEntry[]>;
type LocaleMap = Record<string, Record<string, string>>;

export default function launchFixWebview(
  valueUpdates: EntryValueUpdates,
  idPatches: EntryIdPatches,
  localeMap: LocaleMap,
  baseLocale: string,
  onComplete: () => Promise<void>
) {
  const panel = vscode.window.createWebviewPanel("fixProblems", t("preview.title"), vscode.ViewColumn.One, { enableScripts: true });
  panel.webview.html = buildHtml(valueUpdates, idPatches, localeMap, baseLocale);

  panel.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
    if (msg.type === "apply") {
      applyValueUpdates(valueUpdates, msg.data.valueUpdates);
      applyIdPatches(idPatches, msg.data.idPatches);
      panel.dispose();
      await onComplete();
    } else {
      panel.dispose();
    }
  });
}

interface WebviewMessage {
  type: "apply" | "cancel";
  data: { valueUpdates: EntryValueUpdates; idPatches: Record<string, number[]> };
}

function buildHtml(valueUpdates: EntryValueUpdates, idPatches: EntryIdPatches, localeMap: LocaleMap, baseLocale: string): string {
  const nonce = createNonce();
  return /* html */ `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>${t("preview.title")}</title>
  ${buildStyles()}
</head>
<body>
  <h1>${t("preview.confirm")}</h1>
  <div class="content">
    ${renderValueSection(valueUpdates, localeMap, baseLocale)}
    ${renderIdSection(idPatches)}
  </div>
  <div class="actions">
    <span id="countDisplay">${t("preview.itemsSelected", 0)}</span>
    <button id="btn-apply">${t("preview.apply")}</button>
    <button id="btn-cancel">${t("preview.cancel")}</button>
  </div>
  <script nonce="${nonce}">
    ${buildClientScript()}
  </script>
</body>
</html>`;
}

function buildStyles(): string {
  return /* css */ `
<style>
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
    max-height: 100vh;
    box-sizing: border-box;
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
</style>`;
}

function renderValueSection(updates: EntryValueUpdates, localeMap: LocaleMap, base: string): string {
  if (!Object.keys(updates).length) return "";
  return /* html */ `
  <div class="section value-updates">
    <h2>${t("preview.termValueUpdate")}</h2>
    ${Object.entries(updates)
      .map(
        ([locale, entries]) => /* html */ `
      <details open data-locale="${locale}">
        <summary class="group-head">
          <input type="checkbox" checked>
          <strong>${locale}</strong>
        </summary>
        <div class="group">
          ${Object.entries(entries)
            .map(
              ([key, val]) => /* html */ `
          <div class="item">
            <input type="checkbox" data-key="${key}" data-locale="${locale}" checked>
            <label>${internalToDisplayName(unescapeString(key))}</label>
            <textarea rows="1">${val ?? ""}</textarea>
            ${
              localeMap[locale][key] && localeMap[locale][key] !== val
                ? `<span class="old">${localeMap[locale][key]}</span>`
                : localeMap[base][key]
                  ? `<span>${localeMap[base][key]}</span>`
                  : ""
            }
          </div>`
            )
            .join("")}
        </div>
      </details>`
      )
      .join("")}
  </div>`;
}

function renderIdSection(patches: EntryIdPatches): string {
  if (!Object.keys(patches).length) return "";
  return /* html */ `
  <div class="section id-patches">
    <h2>${t("preview.termIdPatch")}</h2>
    ${Object.entries(patches)
      .map(
        ([file, changes], idx) => /* html */ `
      <details open data-index="${idx}">
        <summary class="group-head">
          <input type="checkbox" checked>
          <strong>${toRelativePath(file)}</strong>
        </summary>
        <div class="group">
          ${changes
            .map(
              (chg, i) => /* html */ `
          <div class="item">
            <input type="checkbox" data-file="${idx}" data-index="${i}" checked>
            <label><span class="old">${chg.raw}</span> → <span class="new">${chg.fixedRaw}</span></label>
          </div>`
            )
            .join("")}
        </div>
      </details>`
      )
      .join("")}
  </div>`;
}

function buildClientScript(): string {
  return `
const vscode = acquireVsCodeApi();
const applyBtn = document.getElementById('btn-apply');

const updateCount = () => {
  const count = document.querySelectorAll('.item input[type=checkbox]:checked').length;
  const textContent = document.getElementById('countDisplay').textContent;
  document.getElementById('countDisplay').textContent = textContent.replace(/\\d+/, count.toString());
  applyBtn.disabled = (count === 0);
};
updateCount();

document.querySelectorAll('.group-head input[type=checkbox]').forEach(chk => {
  chk.onchange = () => {
    const group = chk.closest('details');
    if (group) {
      group.querySelectorAll('input[type=checkbox]').forEach(input => {
        if (input !== chk) {
          input.checked = chk.checked && !input.disabled;
        }
      });
      updateCount();
    }
  }
})

document.querySelectorAll(".value-updates .item textarea").forEach(input => {
  const chk = input.closest('.item').querySelector('input');
  input.addEventListener("input", () => {
    if (chk && chk instanceof HTMLInputElement) {
      const initChecked = chk.checked;
      chk.checked = !!input.value.trim();
      chk.disabled = !chk.checked;
      if (initChecked !== chk.checked) {
        updateCount();
      }
    }
  }); 
})

document.querySelectorAll(".value-updates .item input[type=checkbox]").forEach(chk => {
  const groupHeadChk = document.querySelector(".value-updates details[data-locale='" + chk.dataset.locale + "'] .group-head input[type=checkbox]");
  chk.onchange = () => {
    const group = chk.closest(".value-updates .group");
    const allInLang = [...group.querySelectorAll("input[type=checkbox]")].every(input => input.checked || input.disabled);
    if (groupHeadChk && group) {
      groupHeadChk.checked = allInLang;
    }
    updateCount();
  }
})

document.querySelectorAll(".id-patches .item input[type=checkbox]").forEach(chk => {
  const groupHeadChk = document.querySelector(".id-patches details[data-index='" + chk.dataset.file + "'] .group-head input[type=checkbox]");
  chk.onchange = () => {
    const group = chk.closest(".id-patches .group");
    const allInFile = [...group.querySelectorAll("input[type=checkbox]")].every(input => input.checked);
    if (groupHeadChk && group) {
      groupHeadChk.checked = allInFile;
    }
    updateCount();
  }
})

function applyChanges() {
  if (applyBtn.disabled) return;
  const valueUpdates = {}, idPatches = {};
  document.querySelectorAll('[data-locale]').forEach(sec => {
    const locale = sec.getAttribute('data-locale');
    sec.querySelectorAll('.group input[type=checkbox]').forEach(chk => {
      if (chk.checked) {
        const key = chk.dataset.key;
        const val = (chk.nextElementSibling.nextElementSibling).value;
        valueUpdates[locale] = valueUpdates[locale] || {};
        valueUpdates[locale][key] = val;
      }
    });
  });
  document.querySelectorAll('input[data-file]').forEach(chk => {
    if (chk.checked) {
      const file = chk.dataset.file, idx = +chk.dataset.index;
      idPatches[file] = idPatches[file] || [];
      idPatches[file].push(idx);
    }
  });
  vscode.postMessage({ type: 'apply', data: { valueUpdates, idPatches } });
}

applyBtn.onclick = () => {
  applyChanges();
};

window.addEventListener('keydown', (event) => {
  const target = event.target;
  if (event.key === 'Enter' && target.tagName !== 'TEXTAREA') {
    event.preventDefault();
    applyChanges();
  }
});

document.getElementById('btn-cancel').onclick = () => {
  vscode.postMessage({ type: 'cancel' });
};`;
}

function createNonce(): string {
  return Array.from(
    { length: 32 },
    () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]
  ).join("");
}

function applyValueUpdates(origin: EntryValueUpdates, updates: EntryValueUpdates) {
  for (const locale in origin) {
    if (updates[locale] != null) {
      for (const key in origin[locale]) {
        if (updates[locale][key] != null) {
          origin[locale][key] = updates[locale][key];
        } else {
          delete origin[locale][key];
        }
      }
    } else {
      delete origin[locale];
    }
  }
}

function applyIdPatches(origin: EntryIdPatches, patches: Record<string, number[]>) {
  let fileIndex = 0;
  for (const file in origin) {
    origin[file] = origin[file].filter((_, idx) => patches[fileIndex]?.includes(idx));
    fileIndex++;
  }
}
