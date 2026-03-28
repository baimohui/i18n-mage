import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import previewFixContent from "@/views/fixWebview";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig, setConfig } from "@/utils/config";
import { genIdFromText, getCommonFilePaths, getParentKeys, isEnglishVariable, validateLang } from "@/utils/regex";
import { PREVIEW_CHANGE_SCOPE, shouldPreviewChange } from "@/utils/preview";
import {
  EXECUTION_RESULT_CODE,
  FixExecutionResult,
  FixQuery,
  LangMageOptions,
  NAMESPACE_STRATEGY,
  UNMATCHED_LANGUAGE_ACTION,
  UnmatchedLanguageAction
} from "@/types";
import { isPathInsideDirectory, isSamePath, toRelativePath } from "@/utils/fs";
import { getLangCode, getLangIntro, LANG_CODE_MAPPINGS } from "@/utils/langKey";
import { selectPrefixFromAi } from "@/ai";

const AI_PREFIX_CANDIDATE_LIMIT = 30;

function normalizePrefixList(prefixList: string[] = []) {
  return Array.from(new Set(prefixList.map(item => item.trim()).filter(Boolean)));
}

function normalizeSourceFilePathList(pathList: string[] = []) {
  return Array.from(
    new Set(
      pathList
        .map(item => item.trim())
        .filter(Boolean)
        .map(item => {
          const relativePath = toRelativePath(item);
          const normalized = (relativePath || item).replaceAll("\\", "/").trim();
          return normalized;
        })
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function collectPrefixUsageMap(prefixes: string[], separator: string) {
  const usageMap: Record<string, number> = {};
  const sep = separator || ".";
  prefixes.forEach(prefix => {
    usageMap[prefix] = 0;
  });
  prefixes.forEach(prefix => {
    const token = `${prefix}${sep}`;
    prefixes.forEach(key => {
      if (key === prefix || key.startsWith(token)) {
        usageMap[prefix]++;
      }
    });
  });
  return usageMap;
}

function pickTopPrefixCandidates(prefixes: string[], usageMap: Record<string, number>, limit = AI_PREFIX_CANDIDATE_LIMIT) {
  if (prefixes.length <= limit) return prefixes;
  return [...prefixes]
    .sort((a, b) => {
      const diff = (usageMap[b] ?? 0) - (usageMap[a] ?? 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    })
    .slice(0, limit);
}

function normalizeAiSelectedPrefix(selectedPrefix: string, candidates: string[]) {
  const normalized = selectedPrefix.trim();
  if (candidates.includes(normalized)) return normalized;
  const lower = normalized.toLowerCase();
  return candidates.find(item => item.toLowerCase() === lower) ?? "";
}

function getNamespacePrefix(missingEntryFile: string | undefined, namespaceStrategy: string) {
  if (missingEntryFile === undefined || missingEntryFile.trim().length === 0) return "";
  if (namespaceStrategy === NAMESPACE_STRATEGY.full) {
    return `${missingEntryFile}.`;
  }
  if (namespaceStrategy === NAMESPACE_STRATEGY.file) {
    return `${missingEntryFile.replace(/^.*\./, "")}.`;
  }
  return "";
}

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
    await wrapWithProgress({ title: t("command.fix.progress"), cancellable: true, timeout: 1000 * 60 * 20 }, async (_, token) => {
      await mage.execute({ task: "check" });
      const publicCtx = mage.getPublicContext();
      const { avgFileNestedLevel, nameSeparator, undefined: undefinedMap, classTree } = mage.langDetail;
      // 修复未定义词条
      let undefinedKeys = Object.keys(undefinedMap).filter(key => {
        const { entriesToGen, genScope } = fixQuery;
        return (
          (Array.isArray(entriesToGen) ? entriesToGen.includes(key) : entriesToGen) &&
          (genScope
            ? Object.keys(undefinedMap[key]).some(fp =>
                genScope.some(scopePath => isSamePath(fp, scopePath) || isPathInsideDirectory(scopePath, fp))
              )
            : true)
        );
      });
      const ignorePossibleVariables = getConfig<boolean>("translationServices.ignorePossibleVariables", true);
      if (ignorePossibleVariables) {
        undefinedKeys = undefinedKeys.filter(key => isEnglishVariable(key) === false);
      }
      let tasks: LangMageOptions[] = [{ task: "fix", fixQuery }];
      const matchExistingKey = getConfig<boolean>("translationServices.matchExistingKey", true);
      const validateLanguageBeforeTranslate = getConfig<boolean>("translationServices.validateLanguageBeforeTranslate", true);
      if (undefinedKeys.length > 0) {
        if (matchExistingKey) {
          fixQuery.keyPatch = {};
          const referredLangMap = mage.langDetail.countryMap[publicCtx.referredLang];
          const valueKeyMap = Object.keys(referredLangMap).reduce(
            (prev, cur) => {
              const id = genIdFromText(referredLangMap[cur]);
              return { ...prev, [id]: (prev[id] ?? []).concat(cur) };
            },
            {} as Record<string, string[]>
          );
          const matchedExistingKeySet = new Set<string>();
          for (const key of undefinedKeys) {
            const id = genIdFromText(key);
            if (Object.hasOwn(valueKeyMap, id)) {
              const matchedValidKeys = valueKeyMap[id];
              let selectedValidKey: string | undefined = matchedValidKeys[0];
              if (matchedValidKeys.length > 1) {
                selectedValidKey = await vscode.window.showQuickPick(matchedValidKeys, {
                  placeHolder: t(`command.fix.multipleMatchesForUndefinedKey`, key)
                });
                if (selectedValidKey === undefined) return;
              }
              fixQuery.keyPatch[id] = selectedValidKey;
              matchedExistingKeySet.add(key);
            }
          }
          undefinedKeys = undefinedKeys.filter(key => !matchedExistingKeySet.has(key));
        }
        if (validateLanguageBeforeTranslate) {
          const unmatchedLanguageAction = getConfig<UnmatchedLanguageAction>("translationServices.unmatchedLanguageAction");
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
                undefinedKeys = undefinedKeys.filter(key => !selectKeys.includes(key));
              } else if (operation === t("command.fix.fill")) {
                undefinedKeys = undefinedKeys.filter(key => !selectKeys.includes(key));
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
                  undefinedKeys = undefinedKeys.filter(key => !selectKeys.includes(key));
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
            undefinedKeys = undefinedKeys.filter(key => !currentNonSourceKeys.includes(key));
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
              undefinedKeys = undefinedKeys.filter(key => !currentNonSourceKeys.includes(key));
              tasks.push({
                task: "fix",
                referredLang,
                fixQuery: { entriesToGen: currentNonSourceKeys, entriesToFill: false }
              });
            }
          } else if (unmatchedLanguageAction === UNMATCHED_LANGUAGE_ACTION.ignore) {
            undefinedKeys = undefinedKeys.filter(key => !currentNonSourceKeys.includes(key));
          }
        }
        fixQuery.entriesToGen = undefinedKeys;
        const writeFlag = tasks.length > 1 || undefinedKeys.length > 0;
        let missingEntryFile: string | undefined = undefined;
        if (writeFlag && avgFileNestedLevel && publicCtx.fileStructure) {
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
        const keyPrefix = getConfig<string>("writeRules.keyPrefix", "ai-selection");
        const customPrefixCandidates = normalizePrefixList(getConfig<string[]>("writeRules.prefixCandidates", []));
        const keyStyle = getConfig<string>("writeRules.keyStyle", "camelCase");
        const isAiPrefixSelection = keyPrefix === "ai-selection";
        const skipKeyCategorySelection =
          (keyStyle === "snake_case" && nameSeparator === "_") || (keyStyle === "kebab-case" && nameSeparator === "-");
        if (writeFlag && skipKeyCategorySelection) {
          mage.setOptions({ missingEntryPath: "" });
        }
        const classTreeItem = classTree.find(item => item.filePos === (missingEntryFile ?? ""));
        let commonKeys = classTreeItem && nameSeparator ? getParentKeys(classTreeItem.data, nameSeparator) : [];
        if (nameSeparator) {
          const offset = publicCtx.namespaceStrategy === NAMESPACE_STRATEGY.file ? 1 : (missingEntryFile?.split(".").length ?? 0);
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
        }
        const candidatePrefixes = customPrefixCandidates.length > 0 ? customPrefixCandidates : commonKeys;
        const candidateUsageMap = collectPrefixUsageMap(candidatePrefixes, nameSeparator || ".");
        fixQuery.keyPrefixPatch = undefined;
        const pickManualMissingEntryPath = async () => {
          let missingEntryPath: string | undefined = "";
          if (candidatePrefixes.length > 0) {
            NotificationManager.showProgress({ message: t("command.fix.waitForFileSelection"), increment: 0 });
            const lastPicked = context.workspaceState.get<string>("lastPickedKey");
            let manualOptions = candidatePrefixes;
            if (lastPicked !== undefined && manualOptions.includes(lastPicked)) {
              manualOptions = [lastPicked, ...manualOptions.filter(f => f !== lastPicked)];
            }
            const quickPickItems = customPrefixCandidates.length > 0 ? manualOptions : [...manualOptions, t("command.fix.customKey")];
            missingEntryPath = await vscode.window.showQuickPick(quickPickItems, {
              placeHolder: t("command.fix.selectKeyToWrite")
            });
            if (customPrefixCandidates.length === 0 && missingEntryPath === t("command.fix.customKey")) {
              missingEntryPath = await vscode.window.showInputBox({
                placeHolder: t("command.fix.customKeyInput")
              });
            }
            if (missingEntryPath === undefined) return undefined;
          }
          missingEntryPath = missingEntryPath.trim();
          await context.workspaceState.update("lastPickedKey", missingEntryPath);
          mage.setOptions({ missingEntryPath });
          fixQuery.keyPrefixPatch = undefined;
          return missingEntryPath;
        };
        if (writeFlag && keyPrefix === "manual-selection" && !skipKeyCategorySelection) {
          const selectedPath = await pickManualMissingEntryPath();
          if (selectedPath === undefined) return;
        } else if (writeFlag && isAiPrefixSelection && !skipKeyCategorySelection) {
          let fallbackToManualSelection = candidatePrefixes.length === 0;
          const keyPrefixPatch: Record<string, string> = {};
          const sourceFilePathList = undefinedKeys.map(key => normalizeSourceFilePathList(Object.keys(undefinedMap[key] ?? {})));
          if (!fallbackToManualSelection) {
            let aiCandidates = pickTopPrefixCandidates(candidatePrefixes, candidateUsageMap);
            if (nameSeparator === "\\.") {
              aiCandidates = aiCandidates.map(item => item.replaceAll("\\.", "."));
            }
            const aiPrefixRes = await selectPrefixFromAi({
              sourceTextList: undefinedKeys,
              sourceFilePathList,
              prefixCandidates: aiCandidates
            });
            if (aiPrefixRes.success && Array.isArray(aiPrefixRes.data) && aiPrefixRes.data.length === undefinedKeys.length) {
              const namespacePrefix = getNamespacePrefix(missingEntryFile, publicCtx.namespaceStrategy);
              aiPrefixRes.data.forEach((item, index) => {
                let normalized = normalizeAiSelectedPrefix(item, aiCandidates);
                if (normalized) {
                  if (nameSeparator === "\\." && normalized.includes(".")) {
                    normalized = normalized.replaceAll(".", "\\.");
                  }
                  keyPrefixPatch[genIdFromText(undefinedKeys[index])] = `${namespacePrefix}${normalized}`;
                }
              });
              if (Object.keys(keyPrefixPatch).length === 0) {
                fallbackToManualSelection = true;
              }
            } else {
              fallbackToManualSelection = true;
            }
          }
          if (fallbackToManualSelection) {
            const selectedPath = await pickManualMissingEntryPath();
            if (selectedPath === undefined) return;
          } else {
            fixQuery.keyPrefixPatch = keyPrefixPatch;
            mage.setOptions({ missingEntryPath: "" });
          }
        }
      } else {
        fixQuery.entriesToGen = false;
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
                const quickPickItems = currentNonSourceKeys.map(key => ({
                  label: key,
                  description: referredTranslation[key]
                }));
                const selectValues = await vscode.window.showQuickPick(quickPickItems, {
                  canPickMany: true,
                  placeHolder: t("command.fix.selectNoneSourceTexts")
                });
                if (selectValues === undefined) return;
                selectKeys = selectValues.map(v => v.label);
              }
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
      const previewChanges = shouldPreviewChange(PREVIEW_CHANGE_SCOPE.fix);
      const resList: FixExecutionResult[] = [];
      tasks = tasks.filter(task => {
        const q = task.fixQuery;
        return (
          q !== undefined &&
          ((Array.isArray(q.entriesToGen) && q.entriesToGen.length > 0) ||
            q.entriesToGen === true ||
            (Array.isArray(q.entriesToFill) && q.entriesToFill.length > 0) ||
            q.entriesToFill === true ||
            (q.keyPatch !== undefined && Object.keys(q.keyPatch).length > 0))
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
    async (query?: { data: string[]; meta?: { file?: string } } | vscode.Uri) => {
      const fixQuery = { entriesToGen: true, entriesToFill: false } as FixQuery;
      if (query instanceof vscode.Uri) {
        const fsPath = query.fsPath;
        fixQuery.entriesToGen = true;
        fixQuery.genScope = [fsPath];
      } else if (query && Array.isArray(query.data)) {
        fixQuery.entriesToGen = query.data;
        if (query.meta && typeof query.meta.file === "string" && query.meta.file.trim()) {
          fixQuery.genScope = [query.meta.file];
        }
      }
      await fix(fixQuery);
    }
  );
  const fillMissingTranslationsDisposable = vscode.commands.registerCommand(
    "i18nMage.fillMissingTranslations",
    async (query?: { data: string[]; meta?: { lang?: string } }) => {
      const fixQuery = { entriesToGen: false, entriesToFill: true } as FixQuery;
      if (query && Array.isArray(query.data)) {
        fixQuery.entriesToFill = query.data;
        if (query.meta && typeof query.meta.lang === "string" && query.meta.lang.trim()) {
          fixQuery.fillScope = [query.meta.lang];
        }
      }
      await fix(fixQuery);
    }
  );
  const addLanguageDisposable = vscode.commands.registerCommand("i18nMage.addLanguage", async () => {
    const reverseMap: Record<string, string> = {};
    const publicCtx = mage.getPublicContext();
    const nameKey = getLangCode(publicCtx.defaultLang) === "zh-CN" ? "cnName" : "enName";
    const languageList = Object.entries(LANG_CODE_MAPPINGS)
      .map(([key, info]) => {
        reverseMap[info[nameKey]] = key;
        return info[nameKey];
      })
      .filter(name => mage.detectedLangList.every(i => getLangIntro(i)?.[nameKey] !== name));
    const selectedText = await vscode.window.showQuickPick(languageList, {
      placeHolder: t("command.addLanguage.placeholder")
    });
    if (selectedText === undefined) return;
    const selectedKey = reverseMap[selectedText];
    const mappings = getConfig<Record<string, string[]>>("translationServices.langAliasCustomMappings", {});
    const langAlias = await vscode.window.showInputBox({
      prompt: t("command.addLanguage.prompt", selectedText),
      value: selectedKey,
      validateInput: value => {
        if (value.includes(" ")) return t("common.validate.noSpace");
        if (value === "") return t("common.validate.required");
        if (mage.detectedLangList.includes(value)) return t("command.validate.addLanguageDuplicate");
      }
    });
    if (langAlias === undefined) return;
    const aliases = new Set(mappings[selectedKey] ?? []);
    if (!aliases.has(langAlias)) {
      aliases.add(langAlias);
      await setConfig("translationServices.langAliasCustomMappings", { ...mappings, [selectedKey]: Array.from(aliases) }, "global");
    }
    const fixQuery = { entriesToGen: false, entriesToFill: true, fillScope: [langAlias] } as FixQuery;
    await fix(fixQuery);
  });

  registerDisposable(fixDisposable);
  registerDisposable(fixUndefinedEntriesDisposable);
  registerDisposable(fillMissingTranslationsDisposable);
  registerDisposable(addLanguageDisposable);
}
