# Changelog

All notable changes to the i18n Mage VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2025-10-21

### Added
- **Expanded Translation Services**: Added ChatGPT and Youdao Translate as new translation service providers.
- **Enhanced Google Translate Integration**: Added support for configuring official Google Translate API Key, enabling direct API calls when configured while maintaining free service as fallback.
- **Flexible Indentation Support**: Introduced tab indentation support for language file writing, accommodating diverse team formatting preferences.

### Improved
- **Default Key Prefix Strategy**: Changed the default value for newly generated key prefixes from `none` to `manual-selection` for better key naming experience.
- **Configuration Description Refinement**: Corrected the background alpha configuration description from "transparency" to "opacity" to prevent user confusion.

### Fixed
- **Multi-language Text Display**: Resolved an issue where the "Sync Info" panel incorrectly displayed reference language texts instead of corresponding language texts across all language sections.
- **Plugin Initialization Refresh**: Fixed delayed display of inline translation decorations and current language settings due to missing refresh after plugin initialization.
- **Preview Data Consistency**: Solved a synchronization issue where modified data in preview interfaces wasn't properly applied, with previous data being used instead.

## [1.1.1] - 2025-10-13

### Improved
- **Enhanced Hover Tooltip Interaction**: Upgraded entry hover tooltips with quick navigation to definition locations, one-click text copying, and instant translation for missing texts.

### Fixed
- **Hover Edit Functionality**: Fixed an issue where the edit button in entry hover information panels was unresponsive.
- **Repair Result Synchronization**: Resolved a data sync issue where plugin interfaces continued to display repair results instead of original states after canceling repair applications.
- **Variable Entry Filtering Logic**: Corrected a bug where suspected variable entries still appeared in selection lists during global repairs when "Ignore Suspected Variables" was enabled.
- **Panel Data Real-time Updates**: Fixed delayed updates in the "Current File" module of the plugin panel under certain conditions.
- **Auto-completion Trigger**: Solved incorrect triggering behavior of key auto-completion in specific scenarios.
- **Refined Repair Feedback**: Improved success notification messages and progress bar display for clearer operation feedback.

## [1.1.0] - 2025-10-09

### Added
- **Precision Repair Operations**: Enhanced repair capabilities with granular control - now supports generating new keys for individual undefined entries, supplementing translations for specific missing languages, and completing translations for single missing items.
- **Intelligent Code Completion**: Implemented smart autocompletion for translation functions, displaying candidate entries when typing `t(` with support for key name, value, Chinese Pinyin, and initial letter matching.
- **Flexible Key Generation**: Introduced key name generation based on Pinyin or English translation, providing more naming flexibility.
- **Configurable Translation Scope**: Added options to control translation completion range when generating new keys, supporting either minimal language set or full language coverage.
- **Smart Variable Detection**: Added configuration to automatically identify and exclude variable texts from undefined entry extraction.

### Improved
- **Enhanced Language Validation**: Expanded `validateLanguageBeforeTranslate` to cover both new key generation and missing translation completion. Enhanced validation failure handling with options to skip, keep original value, force translation, or switch translation sources.
- **Key Length Calculation Logic**: Optimized `maxGeneratedKeyLength` to apply only to individual key names rather than full paths (e.g., only `test` is counted in `common.test`).
- **Documentation System Upgrade**: Migrated Chinese documentation to a new VitePress site, offering comprehensive guides and API documentation (new URL: https://baimohui.github.io/i18n-mage-docs/).

### Fixed
- **Status Bar Display Issue**: Resolved incorrect language information display in status bar for non-internationalization projects.
- **Special Character Handling**: Fixed unexpected escaping of period symbols in key names when generating new entries in flat file structures.
- **Sorting Function Failure**: Solved the issue where sorting rules weren't properly applied after certain repair operations.

## [1.0.7] - 2025-09-28

### Added
- **Status Bar Language Info**: Added current display language and translation source language information to the status bar, with click-to-select functionality for quick language switching.

### Changed
- **Unified Language File Structure**: Integrated file structures across languages, allowing selection of non-existent file locations for undefined entries (missing files will be created automatically during write operations).
- **Enhanced Language File Parsing**: Optimized data extraction logic with complete syntax analysis, precise target identification, and improved error handling mechanisms.
- **Streamlined Tooltip Display**: Removed full-language translation tooltips for "Normal" and "Redundant" entry categories in the synchronization panel, now only showing them for "Missing" and "Empty Value" categories for cleaner visualization.

### Fixed
- **Empty Object Selection**: Resolved an issue where nested empty objects in language files couldn't be selected as target locations for undefined entries during manual selection.

## [1.0.6] - 2025-09-19

### Fixed
- **Array Value Parsing**: Resolved an issue where translation files containing array values caused entry parsing exceptions.
- **Reference Language Sync**: Fixed a bug where changing the reference language in configuration files wasn't automatically synchronized within the extension.
- **Array Value Navigation**: Corrected an issue where entries with array values couldn't properly navigate to their definition locations.
- **Single File Cleanup**: Solved a problem where the "Clear Unused Entries" function couldn't remove all entries within a single file.

## [1.0.5] - 2025-09-17

### Added
- **Single File Operations**: Added context menu options to copy translation entries and fix undefined entries directly from the right-click menu in open files.
- **Namespace Configuration**: Introduced a new namespace generation strategy with four options: `'auto'` (auto-inference), `'full'` (full path), `'file'` (filename only), and `'none'` (no namespace).
- **Diagnostics Toggle**: Added configuration option to enable or disable diagnostics as needed.
- **Manual Prefix Selection**: Enhanced key prefix generation with a "manual-selection" option that allows users to choose from existing prefixes when generating translation keys for undefined entries.

### Changed
- **Refined Inline Hint Colors**: Updated default color scheme for translation inline hints with more professional, subtle tones that minimize visual disruption:
  - Light Theme: Font color #2E7D9A with background #9EC9D7 at 40% opacity
  - Dark Theme: Font color #4EC9B0 with background #264F48 at 60% opacity
- **Enhanced DeepSeek Parsing**: Further optimized text segmentation logic to prevent delimiter output when translating single text entries.

### Fixed
- **Chinese Language Detection**: Resolved an issue where "zh" was incorrectly identified as Traditional Chinese instead of Simplified Chinese.
- **Escape Character Handling**: Added proper escape sequence processing for line breaks and special characters when editing entry values, copying entries, and displaying translation tooltips.

## [1.0.4] - 2025-09-09

### Added
- **DeepL Translation Service**: Added support for DeepL as a new translation service provider.
- **Container Menu**: Added a three-dot menu at the container top with buttons to view documentation, open extension settings, and provide feedback.
- **Status Bar Toggle Indicator**: The status bar now displays an enabled/disabled indicator when toggling inline hints via keyboard shortcut.

### Changed
- **Enhanced DeepSeek Parsing**: Optimized the text segmentation logic for DeepSeek translation service to correctly handle and remove extra line breaks in its output.
- **Translation Priority Update**: Adjusted the default translation API priority, raising DeepSeek (due to improved parsing) and lowering Google Translate (which has no API key requirement).
- **Magical Branding**: Updated the fix button icon, extension description, and view names to better reflect the "magical" theme.
- **Auto-Switch View**: The `Refresh` command now automatically switches to the extension's view in the Activity Bar.

### Fixed
- **Diagnostics with Disabled Hints**: Resolved an issue where disabling inline hints also incorrectly disabled entry diagnostics.
- **Dynamic Decoration Cleanup**: Fixed an issue where dynamic entry decorations persisted after disabling inline hints.
- **Quote Writing Error**: Corrected a bug that caused incorrect quotation marks to be written when fixing undefined entries.
- **Key Case Sensitivity**: Fixed a bug where using the filename to generate a key for long entries converted the filename to all lowercase.
- **Activity Bar Visibility**: Resolved an issue where the extension icon remained in the Activity Bar when opening a non-i18n project.
- **Documentation and Text Optimization**: Refined UI text and documentation for clarity and completeness.

## [1.0.3] - 2025-09-01

### Added
- **Enhanced Tooltip Information**: Added tooltips in the "Sync Info" module to display language directories, and in the "Undefined" usage section to indicate whether undefined entry correction is enabled, with additional validation status for sub-items.

### Changed
- **Key Prefix Default Change**: Updated the default value for the "Key Prefix" configuration in "Write Rules" from `auto-popular` to `none` to prevent user confusion.
- **Translation API Priority Adjustment**: Modified the default "Translation API Priority" configuration to move Deepseek to the last position due to output instability.

### Fixed
- **Improved Activation Conditions**: Expanded plugin activation conditions to include additional language and command triggers for better reliability.
- **Command Categorization**: Added plugin-specific categories to commands for easier identification in the command palette.
- **Command Palette Argument Handling**: Resolved errors when invoking commands without arguments from the command palette.
- **Documentation and Text Optimization**: Refined UI text and documentation for clarity and completeness.

## [1.0.2] - 2025-08-28

### Fixed
- **Fix for Undefined Entry Repair Logic**: Resolved an issue where the repair logic could not be properly enabled due to the undefined entry repair feature being turned off.

## [1.0.1] - 2025-08-28

### Fixed
- **Language File Indentation Detection Fix**: Corrected the method for detecting indentation levels in language files, resolving misidentification issues in flat files.

## [1.0.0] - 2025-08-25

### Added
- **Initial release**: The magical i18n assistant is here!
- **Tree View Panel**: A comprehensive overview of all translation keys, their status, and sync state.
- **Inline Hints**: Display translated text right next to the `t()` function in your code.
- **Smart Fix for Undefined Keys**: Automatically generates keys and translations for undefined text.
- **One-Click Translation Completion**: Integrates with Google, DeepSeek, Baidu, and Tencent Translation APIs to fill in missing translations.
- **Excel Import & Export**: Enables easy collaboration with translation teams via Excel files.
- **Unused Key Detection**: Analyzes your project to find and help remove unused keys.
- **Deep Configuration**: Over 50 options to customize the extension's behavior to fit any project.
- **Built-in optimization for Chinese developers**: Native Chinese UI and built-in access to domestic translation APIs.

### Known Issues
- Please report any issues on our [GitHub Issues](https://github.com/baimohui/i18n-mage/issues) page. Your feedback is valued!

