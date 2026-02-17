import * as vscode from "vscode";
import xlsx from "node-xlsx";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import previewFixContent from "@/views/fixWebview";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";
import { Cell, ExcelData, I18nUpdatePayload } from "@/types";
import { getLangIntro, getLangText } from "@/utils/langKey";

type DiffImportEdit = { key: string; lang: string; value: string };

export function registerImportDiffCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();

  const applyUpdates = async (updates: DiffImportEdit[]) => {
    const res = await mage.execute({
      task: "modify",
      modifyQuery: {
        type: "editValue",
        data: updates
      }
    });
    await mage.execute({ task: "check" });
    treeInstance.refresh();
    res.defaultSuccessMessage = t("command.importDiff.success", updates.length);
    NotificationManager.showResult(res);
  };

  const disposable = vscode.commands.registerCommand("i18nMage.importDiff", async () => {
    NotificationManager.showTitle(t("command.importDiff.title"));
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: t("command.importDiff.dialogTitle"),
      filters: {
        "Excel files": ["xlsx", "xls"]
      }
    };
    const fileUri = await vscode.window.showOpenDialog(options);
    if (!Array.isArray(fileUri) || fileUri.length === 0) {
      return;
    }

    await wrapWithProgress({ title: t("command.importDiff.progress") }, async () => {
      const previewChanges = getConfig<boolean>("general.previewChanges", true);
      const excelData = xlsx.parse(fileUri[0].fsPath) as ExcelData;
      const parsed = parseDiffWorkbook(excelData, mage.langDetail.dictionary, mage.detectedLangList);
      if (!parsed.success) {
        NotificationManager.showWarning(parsed.message);
        return;
      }
      if (parsed.updates.length === 0) {
        NotificationManager.showWarning(
          parsed.missingCount > 0
            ? t("command.importDiff.noValidUpdatesWithMissing", parsed.missingCount)
            : t("command.importDiff.noValidUpdates")
        );
        return;
      }
      if (parsed.missingCount > 0) {
        NotificationManager.logToOutput(t("command.importDiff.skippedMissing", parsed.missingCount), "warn");
      }

      if (previewChanges) {
        const publicCtx = mage.getPublicContext();
        previewFixContent(
          context,
          parsed.payloads,
          {},
          mage.langDetail.countryMap,
          publicCtx.referredLang,
          async () => {
            await wrapWithProgress({ title: t("command.importDiff.applying") }, async () => {
              await applyUpdates(parsed.updates);
            });
          },
          async () => {
            await mage.execute({ task: "check" });
            treeInstance.refresh();
          }
        );
      } else {
        await applyUpdates(parsed.updates);
      }
    });
  });

  registerDisposable(disposable);
}

function parseDiffWorkbook(
  excelData: ExcelData,
  dictionary: Record<string, { value: Record<string, string> }>,
  detectedLangList: string[]
):
  | { success: true; message: string; updates: DiffImportEdit[]; payloads: I18nUpdatePayload[]; missingCount: number }
  | { success: false; message: string; updates: []; payloads: []; missingCount: number } {
  const addSheet = excelData.find(sheet => normalizeSheetName(sheet.name) === "ADD");
  const modifySheet = excelData.find(sheet => normalizeSheetName(sheet.name) === "MODIFY");
  if (!addSheet && !modifySheet) {
    return { success: false, message: t("command.importDiff.noDiffSheet"), updates: [], payloads: [], missingCount: 0 };
  }
  return parseModernSheets(addSheet, modifySheet, dictionary, detectedLangList);
}

function parseModernSheets(
  addSheet: ExcelData[number] | undefined,
  modifySheet: ExcelData[number] | undefined,
  dictionary: Record<string, { value: Record<string, string> }>,
  detectedLangList: string[]
):
  | { success: true; message: string; updates: DiffImportEdit[]; payloads: I18nUpdatePayload[]; missingCount: number }
  | { success: false; message: string; updates: []; payloads: []; missingCount: number } {
  const editMap = new Map<string, DiffImportEdit>();
  const payloadMap = new Map<string, I18nUpdatePayload>();
  let missingCount = 0;

  const consumeSheet = (sheet: ExcelData[number] | undefined, type: "add" | "modify") => {
    if (sheet === undefined || sheet.data.length === 0) return;
    const [headerRow, ...rows] = sheet.data;
    const header = headerRow.map(cellToText);
    const keyIndex = findHeaderIndex(header, ["key"]);
    if (keyIndex < 0) {
      throw new Error(t("command.importDiff.invalidSheetHeader"));
    }

    const langColumnMap = resolveLangColumns(header, detectedLangList, type);
    for (const row of rows) {
      const key = cellToText(row[keyIndex]).trim();
      if (!key || !Object.hasOwn(dictionary, key)) {
        if (key) {
          missingCount++;
        }
        continue;
      }
      for (const lang of detectedLangList) {
        const colIndex = langColumnMap[lang];
        if (colIndex === undefined) continue;
        const newValue = cellToText(row[colIndex]);
        const oldValue = dictionary[key].value[lang] ?? "";
        if (!newValue.trim() || newValue === oldValue) {
          continue;
        }
        const editKey = `${key}__${lang}`;
        editMap.set(editKey, { key, lang, value: newValue });
        payloadMap.set(editKey, {
          type: "edit",
          key,
          valueChanges: {
            [lang]: { before: oldValue, after: newValue }
          }
        });
      }
    }
  };

  try {
    if (addSheet) consumeSheet(addSheet, "add");
    if (modifySheet) consumeSheet(modifySheet, "modify");
  } catch (error) {
    const message = error instanceof Error ? error.message : t("command.importDiff.invalidSheetHeader");
    return { success: false, message, updates: [], payloads: [], missingCount: 0 };
  }

  return {
    success: true,
    message: "",
    updates: [...editMap.values()],
    payloads: [...payloadMap.values()],
    missingCount
  };
}

function resolveLangColumns(header: string[], detectedLangList: string[], type: "add" | "modify") {
  const map: Record<string, number> = {};
  for (const lang of detectedLangList) {
    const candidates = getLangHeaderCandidates(lang).flatMap(item => {
      if (type === "modify") {
        return [`${item} (new)`, `${item}_new`, item];
      }
      return [item];
    });
    const idx = findHeaderIndex(header, candidates);
    if (idx >= 0) {
      map[lang] = idx;
    }
  }
  return map;
}

function getLangHeaderCandidates(lang: string): string[] {
  const intro = getLangIntro(lang);
  const aliasSet = new Set<string>([lang, getLangText(lang, "en"), getLangText(lang, "zh-CN")]);
  if (intro) {
    Object.values(intro).forEach(value => {
      if (typeof value === "string" && value.length > 0) {
        aliasSet.add(value);
      }
    });
  }
  return [...aliasSet].filter(Boolean);
}

function findHeaderIndex(header: string[], candidates: string[]): number {
  const normalizedCandidates = candidates.map(normalizeHeader);
  return header.findIndex(col => normalizedCandidates.includes(normalizeHeader(col)));
}

function normalizeSheetName(name: string): string {
  return String(name || "")
    .trim()
    .toUpperCase();
}

function normalizeHeader(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellToText(cell: Cell): string {
  if (cell === null || cell === undefined) {
    return "";
  }
  if (typeof cell === "string") {
    return cell.trim();
  }
  return String(cell).trim();
}
