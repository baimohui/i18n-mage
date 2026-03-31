import * as vscode from "vscode";
import fs from "fs";
import path from "path";
import { getCacheConfig } from "@/utils/config";
import { t } from "@/utils/i18n";
import { LANG_CODE_MAPPINGS } from "@/utils/langKey";
import { NotificationManager } from "@/utils/notification";
import { BootstrapRaw, ExtractBootstrapConfig, getApplyValidationError, sanitizeBootstrapConfig } from "@/core/extract/bootstrapConfig";

export default function launchExtractSetupWebview(
  context: vscode.ExtensionContext,
  params: {
    defaults: ExtractBootstrapConfig;
    hasDetectedLangs: boolean;
    projectPath: string;
    isFirstSetup: boolean;
    uiLanguage: string;
  }
): Promise<BootstrapRaw | null> {
  return new Promise(resolve => {
    const panel = vscode.window.createWebviewPanel("i18nMage.extractSetup", t("command.fix.i18nMageSetup"), vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "dist", "webviews"))]
    });
    panel.iconPath = vscode.Uri.file(path.join(context.extensionPath, "images", "icon.png"));

    const nonce = Math.random().toString(36).slice(2);
    const scriptPath = vscode.Uri.file(path.join(context.extensionPath, "dist", "webviews", "extract-setup.js"));
    const scriptSrc = panel.webview.asWebviewUri(scriptPath).toString();

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${panel.webview.cspSource}; script-src 'nonce-${nonce}' ${panel.webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Extract Setup</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.webviewData = ${JSON.stringify({
      language: params.uiLanguage,
      hasDetectedLangs: params.hasDetectedLangs,
      isFirstSetup: params.isFirstSetup,
      defaults: params.defaults,
      langAliasCustomMappings: getCacheConfig<Record<string, string[]>>("translationServices.langAliasCustomMappings", {}),
      availableLanguages: Array.from(
        new Map(
          Object.entries(LANG_CODE_MAPPINGS).map(([key, info]) => {
            const code = info.ggCode || key;
            return [code, { code, label: `${info.cnName} (${code})` }];
          })
        ).values()
      )
    }).replace(/</g, "\\u003c")};
    window.addEventListener('load', () => {
      setTimeout(() => {
        const root = document.getElementById('root');
        if (root) {
          root.setAttribute('tabindex', '-1');
          root.focus();
        }
        document.body.setAttribute('tabindex', '-1');
        document.body.focus();
        window.focus();
      }, 100);
    });
  </script>
  <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
</body>
</html>`;

    let settled = false;
    const dispose = panel.webview.onDidReceiveMessage((msg: { type: string; value?: unknown }) => {
      if (msg.type === "save") {
        const raw = (msg.value ?? null) as BootstrapRaw | null;
        if (raw === null) {
          NotificationManager.showError(t("command.fix.invalidFormValue"));
          return;
        }
        const parsed = sanitizeBootstrapConfig(raw, params.uiLanguage);
        const validationError = getApplyValidationError({
          hasDetectedLangs: params.hasDetectedLangs,
          fileExtensions: parsed.fileExtensions,
          framework: parsed.framework,
          languagePath: parsed.languagePath,
          targetLanguages: parsed.targetLanguages,
          jsTsFunctionName: parsed.jsTsFunctionName,
          jsTsImportLines: parsed.jsTsImportLines,
          vueScriptImportLines: parsed.vueScriptImportLines,
          skipJsTsInjection: parsed.skipJsTsInjection,
          skipVueScriptInjection: parsed.skipVueScriptInjection
        });
        if (validationError.length > 0) {
          NotificationManager.showError(validationError);
          return;
        }
        if (parsed.extractScopePaths.length > 0) {
          const invalidScopePaths: string[] = [];
          const validScopePaths: string[] = [];
          for (const scopePath of parsed.extractScopePaths) {
            const absoluteScopePath = path.isAbsolute(scopePath) ? scopePath : path.join(params.projectPath, scopePath);
            if (!fs.existsSync(absoluteScopePath)) {
              invalidScopePaths.push(scopePath);
              continue;
            }
            validScopePaths.push(scopePath);
          }
          if (invalidScopePaths.length > 0) {
            NotificationManager.showWarning(t("extractSetup.errorExtractScopePathInvalid", invalidScopePaths.join(", ")));
            if (Array.isArray(raw.extractScopePaths)) {
              raw.extractScopePaths = validScopePaths;
            } else if (typeof raw.extractScopePathsText === "string") {
              raw.extractScopePathsText = validScopePaths.join(", ");
            } else {
              raw.extractScopePaths = validScopePaths;
            }
          }
        }
        if (parsed.ignoreExtractScopePaths.length > 0) {
          const invalidIgnorePaths: string[] = [];
          const validIgnorePaths: string[] = [];
          for (const ignorePath of parsed.ignoreExtractScopePaths) {
            const absoluteIgnorePath = path.isAbsolute(ignorePath) ? ignorePath : path.join(params.projectPath, ignorePath);
            if (!fs.existsSync(absoluteIgnorePath)) {
              invalidIgnorePaths.push(ignorePath);
              continue;
            }
            validIgnorePaths.push(ignorePath);
          }
          if (invalidIgnorePaths.length > 0) {
            NotificationManager.showWarning(t("extractSetup.errorIgnoreScopePathInvalid", invalidIgnorePaths.join(", ")));
            if (Array.isArray(raw.ignoreExtractScopePaths)) {
              raw.ignoreExtractScopePaths = validIgnorePaths;
            } else if (typeof raw.ignoreExtractScopePathsText === "string") {
              raw.ignoreExtractScopePathsText = validIgnorePaths.join(", ");
            } else {
              raw.ignoreExtractScopePaths = validIgnorePaths;
            }
          }
        }
        settled = true;
        panel.dispose();
        resolve(raw);
      } else if (msg.type === "cancel") {
        settled = true;
        panel.dispose();
        resolve(null);
      } else if (msg.type === "error") {
        const detail = typeof msg.value === "string" ? msg.value : t("command.fix.invalidFormValue");
        NotificationManager.showError(detail);
      }
    });

    panel.onDidDispose(() => {
      dispose.dispose();
      if (!settled) {
        resolve(null);
      }
    });

    panel.reveal(vscode.ViewColumn.One);
  });
}
