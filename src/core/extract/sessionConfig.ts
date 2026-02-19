import * as vscode from "vscode";
import { ExtractSessionConfig } from "./types";

const EXTRACT_SESSION_CONFIG_KEY = "extract.sessionConfig.v1";

const DEFAULT_SESSION_CONFIG: ExtractSessionConfig = {
  translationImportTemplate: 'import { t } from "@/i18n";',
  onlyHardcodedLanguageText: false,
  targetLanguages: [],
  vueTemplateFunctionName: "$t",
  vueScriptFunctionName: "t"
};

function sanitizeSessionConfig(raw: Partial<ExtractSessionConfig> | undefined): ExtractSessionConfig {
  if (raw === undefined) return { ...DEFAULT_SESSION_CONFIG };
  return {
    translationImportTemplate:
      typeof raw.translationImportTemplate === "string" && raw.translationImportTemplate.trim().length > 0
        ? raw.translationImportTemplate.trim()
        : DEFAULT_SESSION_CONFIG.translationImportTemplate,
    onlyHardcodedLanguageText:
      typeof raw.onlyHardcodedLanguageText === "boolean" ? raw.onlyHardcodedLanguageText : DEFAULT_SESSION_CONFIG.onlyHardcodedLanguageText,
    targetLanguages: Array.isArray(raw.targetLanguages)
      ? raw.targetLanguages.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : DEFAULT_SESSION_CONFIG.targetLanguages,
    vueTemplateFunctionName:
      typeof raw.vueTemplateFunctionName === "string" && raw.vueTemplateFunctionName.trim().length > 0
        ? raw.vueTemplateFunctionName.trim()
        : DEFAULT_SESSION_CONFIG.vueTemplateFunctionName,
    vueScriptFunctionName:
      typeof raw.vueScriptFunctionName === "string" && raw.vueScriptFunctionName.trim().length > 0
        ? raw.vueScriptFunctionName.trim()
        : DEFAULT_SESSION_CONFIG.vueScriptFunctionName
  };
}

export async function ensureExtractSessionConfig(
  context: vscode.ExtensionContext,
  options: { detectedLangs: string[] }
): Promise<ExtractSessionConfig | null> {
  const raw = context.globalState.get<Partial<ExtractSessionConfig>>(EXTRACT_SESSION_CONFIG_KEY);
  const merged = sanitizeSessionConfig(raw);
  const isExisting = raw !== undefined;
  if (isExisting) {
    return merged;
  }

  const importTemplate = await vscode.window.showInputBox({
    title: "i18n Mage",
    prompt: "Input i18n function import statement for extracted files",
    value: merged.translationImportTemplate,
    ignoreFocusOut: true,
    validateInput: value => (value.trim().length === 0 ? "Import statement is required" : undefined)
  });
  if (importTemplate === undefined) return null;

  const hardcodedPick = await vscode.window.showQuickPick(
    [
      { label: "No (Recommended)", value: false, detail: "Extract all eligible hardcoded strings" },
      { label: "Yes", value: true, detail: "Extract only likely CJK hardcoded strings" }
    ],
    {
      title: "i18n Mage",
      placeHolder: "Only extract likely hardcoded language text"
    }
  );
  if (hardcodedPick === undefined) return null;

  let targetLanguages: string[] = [];
  if (options.detectedLangs.length > 0) {
    const selected = await vscode.window.showQuickPick(
      options.detectedLangs.map(lang => ({ label: lang })),
      {
        title: "i18n Mage",
        canPickMany: true,
        placeHolder: "Select target languages for extraction session (optional)"
      }
    );
    if (selected === undefined) return null;
    targetLanguages = selected.map(item => item.label);
  }

  const nextConfig: ExtractSessionConfig = {
    ...merged,
    translationImportTemplate: importTemplate.trim(),
    onlyHardcodedLanguageText: hardcodedPick.value,
    targetLanguages
  };

  await context.globalState.update(EXTRACT_SESSION_CONFIG_KEY, nextConfig);
  return nextConfig;
}
