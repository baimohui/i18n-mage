import * as vscode from "vscode";
import { t } from "./i18n";
import { getLangCode } from "./langKey";

const LAST_SEEN_VERSION_KEY = "updateSummary.lastSeenVersion";
const DISABLED_KEY = "updateSummary.disabled";
function getChangelogUrl(): string {
  const isCn = getLangCode(vscode.env.language) === "zh-CN";
  return isCn
    ? "https://baimohui.github.io/i18n-mage-docs/zh/changelog.html"
    : "https://baimohui.github.io/i18n-mage-docs/en/changelog.html";
}

function getSummaryForVersion(version: string): string | undefined {
  const key = `updateSummary.version.${version.replace(/\./g, "_")}`;
  const text = t(key);
  if (text === key) return undefined;
  return text;
}

function compareVersions(a: string, b: string): number {
  const normalize = (v: string) => v.split(/[+-]/)[0];
  const aParts = normalize(a)
    .split(".")
    .map(part => Number.parseInt(part, 10));
  const bParts = normalize(b)
    .split(".")
    .map(part => Number.parseInt(part, 10));
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i += 1) {
    const av = Number.isFinite(aParts[i]) ? aParts[i] : 0;
    const bv = Number.isFinite(bParts[i]) ? bParts[i] : 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function getCurrentVersion(context: vscode.ExtensionContext): string | undefined {
  const packageJson = context.extension.packageJSON as unknown;
  if (packageJson === null || packageJson === undefined || typeof packageJson !== "object") return undefined;
  const version = (packageJson as { version?: unknown }).version;
  if (typeof version !== "string") return undefined;
  return version.length > 0 ? version : undefined;
}

async function showUpdateSummaryModal(
  context: vscode.ExtensionContext,
  options: { includeDisable: boolean; includeEnable: boolean }
): Promise<void> {
  const currentVersion = getCurrentVersion(context);
  if (currentVersion === undefined) return;

  const isDisabled = (context.globalState.get<boolean>(DISABLED_KEY) ?? false) === true;
  const summary = getSummaryForVersion(currentVersion);
  const buttons: string[] = [];
  buttons.push(t("common.confirm"));
  buttons.push(t("updateSummary.actions.viewChangelog"));
  if (options.includeDisable) buttons.push(t("updateSummary.actions.disable"));
  if (options.includeEnable && isDisabled) buttons.push(t("updateSummary.actions.enable"));

  const viewLabel = t("updateSummary.actions.viewChangelog");
  const disableLabel = t("updateSummary.actions.disable");
  const enableLabel = t("updateSummary.actions.enable");
  const confirmLabel = t("common.confirm");

  const messageOptions: vscode.MessageOptions =
    summary !== undefined && summary.length > 0 ? { modal: true, detail: summary } : { modal: true };
  const selection = await vscode.window.showInformationMessage(t("updateSummary.title", currentVersion), messageOptions, ...buttons);

  if (selection === confirmLabel) {
    return;
  }

  if (selection === viewLabel) {
    vscode.env.openExternal(vscode.Uri.parse(getChangelogUrl()));
  }

  if (options.includeDisable && selection === disableLabel) {
    await context.globalState.update(DISABLED_KEY, true);
  }

  if (options.includeEnable && selection === enableLabel) {
    await context.globalState.update(DISABLED_KEY, false);
  }
}

export async function showUpdateSummaryIfNeeded(context: vscode.ExtensionContext): Promise<void> {
  const currentVersion = getCurrentVersion(context);
  if (currentVersion === undefined) return;

  const lastSeenVersion = context.globalState.get<string>(LAST_SEEN_VERSION_KEY);
  if (lastSeenVersion === undefined || lastSeenVersion.length === 0) {
    await context.globalState.update(LAST_SEEN_VERSION_KEY, currentVersion);
    return;
  }
  if (lastSeenVersion === currentVersion) return;
  if (compareVersions(currentVersion, lastSeenVersion) <= 0) return;

  const disabled = context.globalState.get<boolean>(DISABLED_KEY) ?? false;
  if (disabled) return;

  await context.globalState.update(LAST_SEEN_VERSION_KEY, currentVersion);
  await showUpdateSummaryModal(context, { includeDisable: true, includeEnable: false });
}

export async function showUpdateSummaryManually(context: vscode.ExtensionContext): Promise<void> {
  await showUpdateSummaryModal(context, { includeDisable: false, includeEnable: true });
}
