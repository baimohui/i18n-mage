import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import previewFixContent from "@/views/fixWebview";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";
import { getCommonFilePaths, getParentKeys, isEnglishVariable, validateLang } from "@/utils/regex";
import {
  EXECUTION_RESULT_CODE,
  FixExecutionResult,
  FixQuery,
  LangMageOptions,
  NAMESPACE_STRATEGY,
  UNMATCHED_LANGUAGE_ACTION,
  UnmatchedLanguageAction
} from "@/types";
import { isSamePath } from "@/utils/fs";

export function registerFixCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const rewrite = async () => {
    const publicCtx = mage.getPublicContext();
    const res = await mage.execute({ task: "rewrite" });
    await mage.execute({ task: "check" });
    if (publicCtx.sortAfterFix) {
      await mage.execute({ task: "sort" });
    }
    setTimeout(() => {
      treeInstance.isSyncing = false;
      treeInstance.refresh();
      res.defaultSuccessMessage = t("command.rewrite.success");
      NotificationManager.showResult(res);
    }, 1000);
  };

  const fix = async (fixQuery: FixQuery) => {
    await wrapWithProgress({ title: t("command.fix.progress"), cancellable: true, timeout: 1000 * 60 * 10 }, async (_, token) => {
      await mage.execute({ task: "check" });
      const publicCtx = mage.getPublicContext();
      const { multiFileMode, nameSeparator, undefined: undefinedMap, classTree } = mage.langDetail;
      // 修复未定义词条
      let undefinedKeys = Object.keys(undefinedMap).filter(key => {
        const { entriesToGen, genScope } = fixQuery;
        return (
          (Array.isArray(entriesToGen) ? entriesToGen.includes(key) : entriesToGen) &&
          (genScope ? Object.keys(undefinedMap[key]).some(fp => genScope.some(fp2 => isSamePath(fp, fp2))) : true)
        );
      });
      const ignorePossibleVariables = getConfig<boolean>("translationServices.ignorePossibleVariables", true);
      if (ignorePossibleVariables) {
        undefinedKeys = undefinedKeys.filter(key => !isEnglishVariable(key));
        fixQuery.entriesToGen = undefinedKeys;
      }
      let tasks: LangMageOptions[] = [{ task: "fix", fixQuery }];
      const validateLanguageBeforeTranslate = getConfig<boolean>("translationServices.validateLanguageBeforeTranslate", true);
      if (undefinedKeys.length > 0) {
        if (validateLanguageBeforeTranslate) {
          const unmatchedLanguageAction = getConfig<UnmatchedLanguageAction>("translationServices.unmatchedLanguageAction");
          fixQuery.entriesToGen = undefinedKeys;
          let currentNonSourceKeys = undefinedKeys.filter(key => !validateLang(key, publicCtx.referredLang));
          if (unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.query) {
            while (currentNonSourceKeys.length > 0) {
              let selectKeys: string[] | undefined = currentNonSourceKeys;
              if (currentNonSourceKeys.length > 1) {
                selectKeys = await vscode.window.showQuickPick(currentNonSourceKeys, {
                  canPickMany: true,
                  placeHolder: t("command.fix.selectInvalidUndefinedKeys")
                });
              }
              if (selectKeys === undefined) return;
              const operation = await vscode.window.showQuickPick(
                [t("command.fix.skip"), t("command.fix.fill"), t("command.fix.force"), t("command.fix.switch")],
                {
                  placeHolder: t("command.fix.selectAction", selectKeys.join(", "))
                }
              );
              if (operation === undefined) return;
              if (operation === t("command.fix.skip")) {
                fixQuery.entriesToGen = fixQuery.entriesToGen.filter(key => !selectKeys.includes(key));
              } else if (operation === t("command.fix.fill")) {
                fixQuery.entriesToGen = fixQuery.entriesToGen.filter(key => !selectKeys.includes(key));
                tasks.push({
                  task: "fix",
                  fixQuery: { entriesToGen: selectKeys, entriesToFill: false, fillWithOriginal: true }
                });
              } else if (operation === t("command.fix.switch")) {
                const langList = mage.detectedLangList.filter(l => !publicCtx.ignoredLangs.includes(l));
                const referredLang = await vscode.window.showQuickPick(langList, {
                  placeHolder: t("command.pick.selectReferredLangForThese", selectKeys.join(", "))
                });
                if (referredLang === undefined) return;
                if (referredLang !== publicCtx.referredLang) {
                  fixQuery.entriesToGen = fixQuery.entriesToGen.filter(key => !selectKeys.includes(key));
                  tasks.push({
                    task: "fix",
                    referredLang,
                    fixQuery: { entriesToGen: selectKeys, entriesToFill: false }
                  });
                }
              }
              currentNonSourceKeys = currentNonSourceKeys.filter(key => !selectKeys.includes(key));
            }
          } else if (unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.fill) {
            fixQuery.entriesToGen = fixQuery.entriesToGen.filter(key => !currentNonSourceKeys.includes(key));
            tasks.push({
              task: "fix",
              fixQuery: { entriesToGen: currentNonSourceKeys, entriesToFill: false, fillWithOriginal: true }
            });
          } else if (unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.switch) {
            const langList = mage.detectedLangList.filter(l => !publicCtx.ignoredLangs.includes(l));
            const referredLang = await vscode.window.showQuickPick(langList, {
              placeHolder: t("command.pick.selectReferredLangForThese", currentNonSourceKeys.join(", "))
            });
            if (referredLang === undefined) return;
            if (referredLang !== publicCtx.referredLang) {
              fixQuery.entriesToGen = fixQuery.entriesToGen.filter(key => !currentNonSourceKeys.includes(key));
              tasks.push({
                task: "fix",
                referredLang,
                fixQuery: { entriesToGen: currentNonSourceKeys, entriesToFill: false }
              });
            }
          } else if (unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.ignore) {
            fixQuery.entriesToGen = fixQuery.entriesToGen.filter(key => !currentNonSourceKeys.includes(key));
          }
        }
        let missingEntryFile: string | undefined = undefined;
        if (multiFileMode && publicCtx.fileStructure) {
          const commonFiles = getCommonFilePaths(publicCtx.fileStructure);
          if (commonFiles.length > 1) {
            NotificationManager.showProgress({ message: t("command.fix.waitForFileSelection"), increment: 0 });
            let sortedFiles: string[] = commonFiles;
            const lastPicked = context.workspaceState.get<string>("lastPickedFile");
            if (lastPicked !== undefined && commonFiles.includes(lastPicked)) {
              sortedFiles = [lastPicked, ...commonFiles.filter(f => f !== lastPicked)];
            }
            missingEntryFile = await vscode.window.showQuickPick(sortedFiles, {
              placeHolder: t("command.fix.selectFileToWrite")
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
        const keyPrefix = getConfig<string>("writeRules.keyPrefix", "");
        if (nameSeparator && keyPrefix === "manual-selection") {
          const classTreeItem = classTree.find(item => item.filePos === (missingEntryFile ?? ""));
          let commonKeys = classTreeItem ? getParentKeys(classTreeItem.data, nameSeparator) : [];
          const offset = publicCtx.namespaceStrategy === NAMESPACE_STRATEGY.file ? 1 : multiFileMode;
          if (publicCtx.namespaceStrategy !== NAMESPACE_STRATEGY.none) {
            commonKeys = commonKeys
              .map(key => {
                const keyParts = key.split(".");
                if (missingEntryFile !== undefined && !missingEntryFile.endsWith(keyParts.slice(0, offset).join("."))) {
                  return "";
                }
                return keyParts.slice(offset).join(".");
              })
              .filter(Boolean);
          }
          let missingEntryPath: string | undefined = "";
          if (commonKeys.length > 0) {
            NotificationManager.showProgress({ message: t("command.fix.waitForFileSelection"), increment: 0 });
            const lastPicked = context.workspaceState.get<string>("lastPickedKey");
            if (lastPicked !== undefined && commonKeys.includes(lastPicked)) {
              commonKeys = [lastPicked, ...commonKeys.filter(f => f !== lastPicked)];
            }
            missingEntryPath = await vscode.window.showQuickPick([...commonKeys, t("command.fix.customKey")], {
              placeHolder: t("command.fix.selectKeyToWrite")
            });
            if (missingEntryPath === t("command.fix.customKey")) {
              missingEntryPath = await vscode.window.showInputBox({
                placeHolder: t("command.fix.customKeyInput")
              });
            }
            if (missingEntryPath === undefined) return;
          }
          missingEntryPath = missingEntryPath.trim();
          await context.workspaceState.update("lastPickedKey", missingEntryPath);
          mage.setOptions({ missingEntryPath });
        }
      }
      // 补充缺漏翻译
      if (validateLanguageBeforeTranslate && fixQuery.entriesToFill !== false) {
        let lackKeys: string[] = [];
        if (Array.isArray(fixQuery.entriesToFill)) {
          lackKeys = fixQuery.entriesToFill;
        } else {
          lackKeys = Object.values(mage.langDetail.lack).flat();
          if (publicCtx.autoTranslateEmptyKey) {
            lackKeys.push(...Object.values(mage.langDetail.null).flat());
          }
          lackKeys = [...new Set(lackKeys)];
        }
        const referredTranslation = mage.langDetail.countryMap[publicCtx.referredLang];
        let currentNonSourceKeys = lackKeys.filter(key => {
          return !!referredTranslation[key] && !validateLang(referredTranslation[key], publicCtx.referredLang);
        });
        if (currentNonSourceKeys.length > 0) {
          const unmatchedLanguageAction = getConfig<UnmatchedLanguageAction>("translationServices.unmatchedLanguageAction");
          fixQuery.entriesToFill = lackKeys;
          if (unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.query) {
            while (currentNonSourceKeys.length > 0) {
              let selectKeys: string[] | undefined = currentNonSourceKeys;
              if (currentNonSourceKeys.length > 1) {
                selectKeys = await vscode.window.showQuickPick(currentNonSourceKeys, {
                  canPickMany: true,
                  placeHolder: t("command.fix.selectNoneSourceTexts")
                });
              }
              if (selectKeys === undefined) return;
              const operation = await vscode.window.showQuickPick(
                [t("command.fix.skip"), t("command.fix.fill"), t("command.fix.force"), t("command.fix.switch")],
                {
                  placeHolder: t("command.fix.selectAction", selectKeys.map(key => referredTranslation[key]).join(", "))
                }
              );
              if (operation === undefined) return;
              if (operation === t("command.fix.skip")) {
                fixQuery.entriesToFill = fixQuery.entriesToFill.filter(key => !selectKeys.includes(key));
              } else if (operation === t("command.fix.fill")) {
                fixQuery.entriesToFill = fixQuery.entriesToFill.filter(key => !selectKeys.includes(key));
                tasks.push({
                  task: "fix",
                  fixQuery: { entriesToFill: selectKeys, entriesToGen: false, fillWithOriginal: true }
                });
              } else if (operation === t("command.fix.switch")) {
                const langList = mage.detectedLangList.filter(l => !publicCtx.ignoredLangs.includes(l));
                const referredLang = await vscode.window.showQuickPick(langList, {
                  placeHolder: t("command.pick.selectReferredLangForThese", selectKeys.map(key => referredTranslation[key]).join(", "))
                });
                if (referredLang === undefined) return;
                if (referredLang !== publicCtx.referredLang) {
                  fixQuery.entriesToFill = fixQuery.entriesToFill.filter(key => !selectKeys.includes(key));
                  const notExistedKeys = selectKeys.filter(key => !mage.langDetail.countryMap[referredLang][key]);
                  if (notExistedKeys.length > 0) {
                    tasks.push({
                      task: "fix",
                      fixQuery: { entriesToFill: notExistedKeys, entriesToGen: false, fillWithOriginal: true, fillScope: [referredLang] }
                    });
                  }
                  tasks.push({
                    task: "fix",
                    referredLang,
                    fixQuery: { entriesToFill: selectKeys, entriesToGen: false }
                  });
                }
              }
              currentNonSourceKeys = currentNonSourceKeys.filter(key => !selectKeys.includes(key));
            }
          } else if (unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.fill) {
            fixQuery.entriesToFill = fixQuery.entriesToFill.filter(key => !currentNonSourceKeys.includes(key));
            tasks.push({
              task: "fix",
              fixQuery: { entriesToFill: currentNonSourceKeys, entriesToGen: false, fillWithOriginal: true }
            });
          } else if (unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.switch) {
            const langList = mage.detectedLangList.filter(l => !publicCtx.ignoredLangs.includes(l));
            const referredLang = await vscode.window.showQuickPick(langList, {
              placeHolder: t(
                "command.pick.selectReferredLangForThese",
                currentNonSourceKeys.map(key => referredTranslation[key]).join(", ")
              )
            });
            if (referredLang === undefined) return;
            if (referredLang !== publicCtx.referredLang) {
              fixQuery.entriesToFill = fixQuery.entriesToFill.filter(key => !currentNonSourceKeys.includes(key));
              const notExistedKeys = currentNonSourceKeys.filter(key => !mage.langDetail.countryMap[referredLang][key]);
              if (notExistedKeys.length > 0) {
                tasks.push({
                  task: "fix",
                  fixQuery: { entriesToFill: notExistedKeys, entriesToGen: false, fillWithOriginal: true, fillScope: [referredLang] }
                });
              }
              tasks.push({
                task: "fix",
                referredLang,
                fixQuery: { entriesToFill: currentNonSourceKeys, entriesToGen: false }
              });
            }
          } else if (unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.ignore) {
            fixQuery.entriesToFill = fixQuery.entriesToFill.filter(key => !currentNonSourceKeys.includes(key));
          }
        }
      }
      treeInstance.isSyncing = tasks[0].fixQuery?.fillScope || true;
      treeInstance.refresh();
      const previewChanges = getConfig<boolean>("general.previewChanges", true);
      const resList: FixExecutionResult[] = [];
      tasks = tasks.filter(task => {
        const q = task.fixQuery;
        return (
          (Array.isArray(q?.entriesToGen) && q.entriesToGen.length > 0) ||
          q?.entriesToGen === true ||
          (Array.isArray(q?.entriesToFill) && q.entriesToFill.length > 0) ||
          q?.entriesToFill === true
        );
      });
      for (const task of tasks) {
        resList.push((await mage.execute(task)) as FixExecutionResult);
      }
      if (token.isCancellationRequested) {
        treeInstance.isSyncing = false;
        treeInstance.refresh();
        return;
      }
      const res: FixExecutionResult = resList.reduce(
        (prev, curr) => {
          prev.data ??= { success: 0, failed: 0, generated: 0, total: 0, patched: 0 };
          curr.data ??= { success: 0, failed: 0, generated: 0, total: 0, patched: 0 };
          return {
            ...prev,
            success: prev.success && curr.success,
            data: {
              success: prev.data.success + curr.data.success,
              failed: prev.data.failed + curr.data.failed,
              generated: prev.data.generated + curr.data.generated,
              total: prev.data.total + curr.data.total,
              patched: prev.data.patched + curr.data.patched
            }
          };
        },
        {
          success: true,
          message: "",
          code: EXECUTION_RESULT_CODE.Success
        } as FixExecutionResult
      );
      if (res.data === undefined || (res.data.total === 0 && res.data.patched === 0)) {
        res.message = t("command.fix.nullWarn");
        res.code = EXECUTION_RESULT_CODE.NoLackEntries;
      } else if (res.data.total === 0 && res.data.patched > 0) {
        res.message = t("command.fix.existingUndefinedSuccess", res.data.patched);
        res.code = EXECUTION_RESULT_CODE.Success;
      } else if (res.data.total > 0 && res.data.success === res.data.total) {
        res.message = t("command.fix.translatorSuccess", res.data.success, res.data.generated);
        res.code = EXECUTION_RESULT_CODE.Success;
      } else if (res.data.success > 0 && res.data.failed > 0) {
        res.message = t("command.fix.translatorPartialSuccess", res.data.total, res.data.success, res.data.generated, res.data.failed);
        res.code = EXECUTION_RESULT_CODE.TranslatorPartialFailed;
      } else {
        res.success = false;
        res.message = t("command.fix.translatorFailed", res.data.failed);
        res.code = EXECUTION_RESULT_CODE.TranslatorFailed;
      }
      setTimeout(() => {
        NotificationManager.showResult(res, t("command.fix.viewDetails")).then(selection => {
          if (selection === t("command.fix.viewDetails")) {
            NotificationManager.showOutputChannel();
          }
        });
      }, 1000);
      const { updatePayloads, patchedIds, countryMap } = mage.langDetail;
      if (res.success && (updatePayloads.length > 0 || Object.keys(patchedIds).length > 0)) {
        if (previewChanges) {
          treeInstance.isSyncing = false;
          treeInstance.refresh();
          previewFixContent(
            context,
            updatePayloads,
            patchedIds,
            countryMap,
            publicCtx.referredLang,
            async () => {
              await wrapWithProgress({ title: t("command.rewrite.progress") }, rewrite);
            },
            async () => {
              await mage.execute({ task: "check" });
              treeInstance.refresh();
            }
          );
        } else {
          await rewrite();
        }
      } else {
        treeInstance.isSyncing = false;
        treeInstance.refresh();
      }
    });
  };

  const fixDisposable = vscode.commands.registerCommand("i18nMage.fix", async () => {
    const autoTranslateMissingKey = getConfig<boolean>("translationServices.autoTranslateMissingKey", false);
    await fix({
      entriesToGen: autoTranslateMissingKey,
      entriesToFill: true
    });
  });
  const fixUndefinedEntriesDisposable = vscode.commands.registerCommand(
    "i18nMage.fixUndefinedEntries",
    async (query?: { data: string[]; meta?: { scope?: string } } | vscode.Uri) => {
      const fixQuery = { entriesToGen: true, entriesToFill: false } as FixQuery;
      if (query instanceof vscode.Uri) {
        const fsPath = query.fsPath;
        fixQuery.entriesToGen = true;
        fixQuery.genScope = [fsPath];
      } else if (query && Array.isArray(query.data)) {
        fixQuery.entriesToGen = query.data;
        if (query.meta && typeof query.meta.scope === "string" && query.meta.scope.trim()) {
          fixQuery.genScope = [query.meta.scope];
        }
      }
      await fix(fixQuery);
    }
  );
  const fillMissingTranslationsDisposable = vscode.commands.registerCommand(
    "i18nMage.fillMissingTranslations",
    async (query?: { data: string[]; meta?: { scope?: string } }) => {
      const fixQuery = { entriesToGen: false, entriesToFill: true } as FixQuery;
      if (query && Array.isArray(query.data)) {
        fixQuery.entriesToFill = query.data;
        if (query.meta && typeof query.meta.scope === "string" && query.meta.scope.trim()) {
          fixQuery.fillScope = [query.meta.scope];
        }
      }
      await fix(fixQuery);
    }
  );

  registerDisposable(fixDisposable);
  registerDisposable(fixUndefinedEntriesDisposable);
  registerDisposable(fillMissingTranslationsDisposable);
}
