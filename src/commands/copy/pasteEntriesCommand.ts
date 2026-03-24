import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";
import { EditValueQuery, I18nUpdatePayload, LANGUAGE_STRUCTURE, NAMESPACE_STRATEGY } from "@/types";
import { treeInstance } from "@/views/tree";
import { getLangCode } from "@/utils/langKey";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { getCacheConfig } from "@/utils/config";
import { getCommonFilePaths, getFileLocationFromId } from "@/utils/regex";
import previewFixContent from "@/views/fixWebview";
import { PREVIEW_CHANGE_SCOPE, shouldPreviewChange } from "@/utils/preview";

export function registerPasteEntriesCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const resolveLang = (target: string) => {
    if (mage.detectedLangList.length === 0) return target;
    const targetCode = getLangCode(target);
    return (
      mage.detectedLangList.find(lang => lang === target) ?? mage.detectedLangList.find(lang => getLangCode(lang) === targetCode) ?? ""
    );
  };
  const disposable = vscode.commands.registerCommand("i18nMage.pasteEntries", async () => {
    const { dictionary, languageStructure, avgFileNestedLevel } = mage.langDetail;
    const publicCtx = mage.getPublicContext();
    const targetText = await vscode.env.clipboard.readText();
    try {
      const target = JSON.parse(targetText) as Record<string, Record<string, string>>;
      const allowDotInNestedKey = getCacheConfig<boolean>("writeRules.allowDotInNestedKey", true);
      const entries = Object.entries(target).map(([key, translation]) => {
        if (languageStructure === LANGUAGE_STRUCTURE.flat) {
          key = key.replace(/(?<!\\)\./g, "\\.");
        } else if (!allowDotInNestedKey) {
          key = key.replace(/\\\./g, ".");
        }
        return [key, translation] as [string, Record<string, string>];
      });
      const data: EditValueQuery["data"] = [];
      const updatePayloads: I18nUpdatePayload[] = [];
      if (entries.length > 0) {
        let missingEntryFile: string | undefined = undefined;
        if (avgFileNestedLevel && publicCtx.fileStructure) {
          const countUnescapedDots = (str: string) => (str.match(/(?<!\\)\./g) || []).length;
          const minFileNestedLevel = Math.floor(avgFileNestedLevel);
          const isFilePosUnsure = entries.some(
            ([key, _]) =>
              (getFileLocationFromId(key, publicCtx.fileStructure) === null && countUnescapedDots(key) < minFileNestedLevel) ||
              publicCtx.namespaceStrategy === NAMESPACE_STRATEGY.none
          );
          if (isFilePosUnsure) {
            const commonFiles = getCommonFilePaths(publicCtx.fileStructure);
            if (commonFiles.length > 1) {
              let sortedFiles: string[] = commonFiles;
              const lastPicked = context.workspaceState.get<string>("lastPickedFile");
              if (lastPicked !== undefined && commonFiles.includes(lastPicked)) {
                sortedFiles = [lastPicked, ...commonFiles.filter(f => f !== lastPicked)];
              }
              missingEntryFile = await vscode.window.showQuickPick(sortedFiles, {
                placeHolder: t("command.fix.selectFileToPaste")
              });
            } else if (commonFiles.length === 1) {
              missingEntryFile = commonFiles[0];
            }
            if (typeof missingEntryFile === "string" && missingEntryFile.trim()) {
              missingEntryFile = missingEntryFile.replaceAll("/", ".");
              mage.setOptions({ missingEntryFile });
              await context.workspaceState.update("lastPickedFile", missingEntryFile);
            } else {
              mage.setOptions({ missingEntryFile: "" });
              return;
            }
          }
        }
        const existedKeys = entries.map(([key, _]) => key).filter(key => Object.hasOwn(dictionary, key));
        let skipExistedKeys = false;
        if (existedKeys.length > 0) {
          const confirm = await NotificationManager.showWarning(
            t("command.pasteEntries.confirm", existedKeys.length),
            { modal: true },
            t("command.pasteEntries.confirm.overwrite"),
            t("command.pasteEntries.confirm.skip")
          );
          if (confirm === t("command.pasteEntries.confirm.skip")) {
            skipExistedKeys = true;
          } else if (confirm !== t("command.pasteEntries.confirm.overwrite")) {
            return;
          }
        }
        entries.forEach(([key, translation]) => {
          if (skipExistedKeys && Object.hasOwn(dictionary, key)) return;
          for (const [lang, value] of Object.entries(translation)) {
            const targetLang = resolveLang(lang);
            if (targetLang) {
              data.push({ key, value, lang: targetLang });
            }
          }
        });
        if (data.length > 0) {
          const payloadMap = new Map<string, I18nUpdatePayload>();
          data.forEach(item => {
            if (item.lang == undefined) return;
            const existed = Object.hasOwn(dictionary, item.key);
            const payload =
              payloadMap.get(item.key) ??
              ({
                type: existed ? "edit" : "add",
                key: item.key,
                valueChanges: {}
              } as I18nUpdatePayload);
            const before = mage.langDetail.countryMap[item.lang]?.[item.key] ?? "";
            payload.valueChanges![item.lang] = existed ? { before, after: item.value } : { after: item.value };
            payloadMap.set(item.key, payload);
          });
          updatePayloads.push(...payloadMap.values());

          const applyUpdates = async () => {
            await wrapWithProgress({ title: t("command.rewrite.progress") }, async () => {
              mage.setPendingChanges(updatePayloads, {});
              await mage.execute({ task: "rewrite" });
              await mage.execute({ task: "check" });
              treeInstance.refresh();
              setTimeout(() => {
                NotificationManager.showSuccess(
                  t("command.pasteEntries.success", skipExistedKeys ? entries.length - existedKeys.length : entries.length)
                );
              }, 1000);
            });
          };

          const previewChanges = shouldPreviewChange(PREVIEW_CHANGE_SCOPE.pasteEntries);
          if (previewChanges) {
            const publicCtx = mage.getPublicContext();
            const { countryMap } = mage.langDetail;
            mage.setPendingChanges(updatePayloads, {});
            previewFixContent(
              context,
              updatePayloads,
              {},
              countryMap,
              publicCtx.referredLang,
              async () => {
                await applyUpdates();
              },
              async () => {
                await mage.execute({ task: "check" });
                treeInstance.refresh();
              }
            );
          } else {
            await applyUpdates();
          }
          return;
        }
      }
      NotificationManager.showWarning(t("command.pasteEntries.empty"));
    } catch (error) {
      console.error(error);
      NotificationManager.showWarning(t("command.pasteEntries.error", targetText));
    }
  });

  registerDisposable(disposable);
}
