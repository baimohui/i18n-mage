<h1>i18n Mage</h1>

<p>
  <a href="https://baimohui.github.io/i18n-mage-docs/en/guide/introduction.html">English</a> | <a href="https://baimohui.github.io/i18n-mage-docs/zh/guide/introduction.html">简体中文</a>
</p>

<p>
  Streamline your frontend i18n workflow with Vue I18n & React i18next support, auto-completion, inline hints, and Excel import/export.
</p>

<p>
  <a href="https://marketplace.visualstudio.com/items?itemName=jensen-wen.i18n-mage">
    <img src="https://img.shields.io/visual-studio-marketplace/v/jensen-wen.i18n-mage.svg?label=VS%20Code%20Marketplace" alt="VS Code Marketplace" />
  </a>
  <a href="https://open-vsx.org/extension/jensen-wen/i18n-mage">
    <img src="https://img.shields.io/open-vsx/v/jensen-wen/i18n-mage?label=Open%20VSX" alt="Open VSX Version" />
  </a>
  <a href="https://github.com/baimohui/i18n-mage/stargazers">
    <img src="https://img.shields.io/github/stars/baimohui/i18n-mage?style=social" alt="GitHub Stars" />
  </a>
  <a href="https://github.com/baimohui/i18n-mage/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT" />
  </a>
  <a href="https://github.com/baimohui/i18n-mage/issues">
    <img src="https://img.shields.io/github/issues/baimohui/i18n-mage" alt="Issues" />
  </a>
  <a href="https://deepwiki.com/baimohui/i18n-mage">
    <img src="https://raw.githubusercontent.com/baimohui/i18n-mage-docs/refs/heads/main/docs/public/badge.png" alt="Ask DeepWiki">
  </a>
</p>

---
## ✨ Features

### 🌳 Translation Tree Overview

* Displays an overview panel via the VS Code sidebar.
* Includes statistics (total keys, missing translations, etc.).
* Sync status per language file.
* Tree-structured view of translation entries.
* Functional buttons: Search, Export, Import, Sort, Fix.

![Tree Provider](https://raw.githubusercontent.com/baimohui/i18n-mage/refs/heads/main/doc-assets/panelView.png)

### 🧠 Inline Translation Hints

* Show actual translation inline where `t()` is used.
* Supports custom styles (color, max length, etc.).
* Toggleable via shortcuts.

![Inline Hints](https://raw.githubusercontent.com/baimohui/i18n-mage/refs/heads/main/doc-assets/inlineHints.gif)

### ⚡ Intelligent Code Completion

* Automatically suggests existing translation entries when typing internationalization functions (e.g., `t("...")`)
* Supports candidate filtering by key, value, or bidirectional matching
* Auto-fills translation keys to boost multilingual development efficiency

![Code Completion](https://raw.githubusercontent.com/baimohui/i18n-mage/refs/heads/main/doc-assets/completion.gif)

### 🚧 Auto-Fill Missing Translations

- Integrates global providers (DeepL, Google, OpenAI/ChatGPT) and optional regional providers (DeepSeek, Baidu, Tencent, Youdao)
- Fill missing translations automatically with preview and manual review

![Auto-Fill Missing Translations](https://raw.githubusercontent.com/baimohui/i18n-mage/refs/heads/main/doc-assets/fixMissingTranslation.gif)

### 🧹 Auto-Fix Undefined Entries

- Detect undefined entries
- Match existing entries or extract text into new entries
- Support customizable key naming strategies

![Auto-Fix Undefined Entries](https://raw.githubusercontent.com/baimohui/i18n-mage/refs/heads/main/doc-assets/fixUndefinedTranslation.gif)

### 🛄 Extract Hardcoded Texts
- Scan hardcoded texts and batch-extract them into i18n keys
- Replace source code and write back into language files
- Preview before apply, suitable for migrating legacy projects

![Extract Hardcoded Texts](https://raw.githubusercontent.com/baimohui/i18n-mage/refs/heads/main/doc-assets/extractHardcodedText.gif)

### 🕵️ Detect Unused Keys

* Analyzes usage of all keys.
* Pattern matching for dynamic keys.
* Delete or mark as used manually.

![Detect Unused Keys](https://raw.githubusercontent.com/baimohui/i18n-mage/refs/heads/main/doc-assets/checkUsage.gif)

### 🔍 Search Translation Entries

- Search across languages to locate target entries quickly
- Support whole-word and case-sensitive search

![Search Translation Entries](https://raw.githubusercontent.com/baimohui/i18n-mage/refs/heads/main/doc-assets/search.gif)

### 📊 Excel Import/Export

- Export entries to Excel for translation teams
- Import translations from Excel and write back automatically
- Export git-based diff sheets (ADD/MODIFY/DELETE)
- Import diff sheets back into project

![Excel Import/Export](https://raw.githubusercontent.com/baimohui/i18n-mage/refs/heads/main/doc-assets/excel.png)

### 📋 Cross-Project Entry Migration
- Copy entries by file or prefix into clipboard
- Paste copied entries into target projects for fast migration

![Copy Translation Data](https://raw.githubusercontent.com/baimohui/i18n-mage/refs/heads/main/doc-assets/copyCurrentPage.gif)

### Write Sorting
- Sort by key name or first occurrence position
- Reduce noisy diffs after fixes
![Sorting](https://raw.githubusercontent.com/baimohui/i18n-mage/refs/heads/main/doc-assets/sorting.gif)

## ⚡ Quick Start

### 1. Install the Extension

**Option 1: Install from VS Code**
1. Open VS Code and go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Search for `i18n Mage`
3. Click **Install**

**Option 2: Command Line Installation**
```bash
ext install jensen-wen.i18n-mage
```

**Option 3: Manual Installation**  
Visit the [Marketplace Page](https://marketplace.visualstudio.com/items?itemName=jensen-wen.i18n-mage) to install.

### 2. Open Translation Panel

- The extension automatically scans your project's i18n directory after activation
- Click the i18n Mage icon in the sidebar to open the translation panel
- Right-click in the panel to manually set translation directory if not auto-detected

### 3. Set Languages

- Right-click to configure display and source languages
- Manually assign languages to files if automatic detection fails

### 4. Configure Translation Services (Optional)

- Supported services: DeepL, Google, DeepSeek, Baidu, Tencent
- Configuration path: `Settings → Extensions → i18n Mage → Translation Services`

## 🧰 Configuration

### 🚀 Key Categories

* General settings
* Framework support (e.g. translation function names, interpolation)
* Translation services (API keys, reference language)
* Analysis rules (file scanning, auto detection)
* Write rules (key style, quote style, indentation)
* Inline hint styling
* Workspace-specific settings

> All settings are accessible via the VS Code Settings UI or in `.vscode/settings.json`.

See [Full Config Reference](#-full-config-reference) for all options.

## 🤝 Contributing

```bash
git clone https://github.com/baimohui/i18n-mage.git
cd i18n-mage
npm install
npm run check
npm run build
```

Feel free to submit issues or PRs!

## 📄 License

MIT License © 2024-2025 Jensen Wen
