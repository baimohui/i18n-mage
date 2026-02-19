import * as vscode from "vscode";
import path from "path";
import fs from "fs";
import LangMage from "@/core/LangMage";
import previewFixContent from "@/views/fixWebview";
import { treeInstance } from "@/views/tree";
import { I18nUpdatePayload, FixedTEntry, DirNode, NAMESPACE_STRATEGY } from "@/types";
import { getConfig } from "@/utils/config";
import { registerDisposable } from "@/utils/dispose";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { scanHardcodedTextCandidates } from "@/core/extract/astExtractService";
import {
  genKeyFromText,
  genIdFromText,
  getValueByAmbiguousEntryName,
  internalToDisplayName,
  unescapeString,
  generateKey,
  splitFileName,
  getCommonFilePaths,
  getParentKeys
} from "@/utils/regex";
import { toRelativePath } from "@/utils/fs";
import { applyCodePatches } from "@/core/extract/applyCodePatches";
import { ensureBootstrapConfig } from "@/core/extract/bootstrapConfig";
import { getLangCode } from "@/utils/langKey";
import translateTo from "@/translator";
import * as pinyin from "tiny-pinyin";
import generateKeyFrom from "@/keyAiGenerator";

function getPathPrefix(candidateFile: string, keyPrefix: string, stopPrefixes: string[], nameSeparator: string) {
  if (keyPrefix !== "auto-path") return "";
  const relativePath = toRelativePath(candidateFile);
  const pathParts = relativePath
    .replace(/\.\w+$/, "")
    .split("/")
    .filter(part => part.length > 0 && !stopPrefixes.includes(part));
  if (pathParts.length === 0) return "";
  return `${pathParts.join(nameSeparator)}${nameSeparator}`;
}

function getSafeKeyLen(maxKeyLength: number, prefix: string) {
  return Math.max(8, maxKeyLength - prefix.length);
}

async function ensureBootstrapLangFiles(
  projectPath: string,
  bootstrap: {
    languagePath: string;
    targetLanguages: string[];
    translationFileType: string;
    referenceLanguage: string;
  }
) {
  const langDir = path.isAbsolute(bootstrap.languagePath) ? bootstrap.languagePath : path.join(projectPath, bootstrap.languagePath);
  await fs.promises.mkdir(langDir, { recursive: true });
  const langs = bootstrap.targetLanguages.length > 0 ? bootstrap.targetLanguages : [bootstrap.referenceLanguage || "en"];
  for (const lang of langs) {
    const filePath = path.join(langDir, `${lang}.${bootstrap.translationFileType}`);
    if (!fs.existsSync(filePath)) {
      await fs.promises.writeFile(filePath, "{}\n", "utf8");
    }
  }
}

async function resolveManualPrefix(
  context: vscode.ExtensionContext,
  params: {
    writeFlag: boolean;
    keyPrefix: string;
    nameSeparator: string;
    avgFileNestedLevel: number;
    fileStructure: DirNode | null;
    namespaceStrategy: string;
    classTree: Array<{ filePos: string; data: Record<string, unknown> }>;
  }
) {
  if (!params.writeFlag || params.keyPrefix !== "manual-selection" || params.nameSeparator.trim().length === 0) {
    return "";
  }

  let missingEntryFile = "";
  if (params.avgFileNestedLevel > 0 && params.fileStructure !== undefined && params.fileStructure !== null) {
    const commonFiles = getCommonFilePaths(params.fileStructure);
    if (commonFiles.length > 1) {
      NotificationManager.showProgress({ message: t("command.fix.waitForFileSelection"), increment: 0 });
      let sortedFiles = commonFiles;
      const lastPicked = context.workspaceState.get<string>("extract.lastPickedFile");
      if (typeof lastPicked === "string" && commonFiles.includes(lastPicked)) {
        sortedFiles = [lastPicked, ...commonFiles.filter(item => item !== lastPicked)];
      }
      const selectedFile = await vscode.window.showQuickPick(sortedFiles, { placeHolder: t("command.fix.selectFileToWrite") });
      if (typeof selectedFile !== "string" || selectedFile.trim().length === 0) return null;
      missingEntryFile = selectedFile.replaceAll("/", ".");
      await context.workspaceState.update("extract.lastPickedFile", selectedFile);
    } else if (commonFiles.length === 1) {
      missingEntryFile = commonFiles[0].replaceAll("/", ".");
    }
  }

  const classTreeItem = params.classTree.find(item => item.filePos === missingEntryFile);
  const targetTreeItem = classTreeItem ?? params.classTree[0];
  if (targetTreeItem === undefined) return "";
  let commonKeys = getParentKeys(targetTreeItem.data, params.nameSeparator);
  const offset = params.namespaceStrategy === NAMESPACE_STRATEGY.file ? 1 : (missingEntryFile.split(".").filter(Boolean).length ?? 0);
  if (params.namespaceStrategy !== NAMESPACE_STRATEGY.none) {
    commonKeys = commonKeys
      .map(key => {
        const keyParts = key.split(".");
        if (missingEntryFile && !missingEntryFile.endsWith(keyParts.slice(0, offset).join("."))) return "";
        return keyParts.slice(offset).join(".");
      })
      .filter(Boolean);
  }
  if (commonKeys.length === 0) return "";

  NotificationManager.showProgress({ message: t("command.fix.waitForFileSelection"), increment: 0 });
  const lastPicked = context.workspaceState.get<string>("extract.lastPickedKey");
  if (typeof lastPicked === "string" && commonKeys.includes(lastPicked)) {
    commonKeys = [lastPicked, ...commonKeys.filter(item => item !== lastPicked)];
  }
  let selected = await vscode.window.showQuickPick([...commonKeys, t("command.fix.customKey")], {
    placeHolder: t("command.fix.selectKeyToWrite")
  });
  if (selected === undefined) return null;
  if (selected === t("command.fix.customKey")) {
    selected = await vscode.window.showInputBox({ placeHolder: t("command.fix.customKeyInput") });
    if (selected === undefined) return null;
  }
  const result = selected.trim();
  await context.workspaceState.update("extract.lastPickedKey", result);
  if (result.length === 0) return "";
  return result.endsWith(params.nameSeparator) || result.endsWith(".") ? result : `${result}${params.nameSeparator}`;
}

export function registerExtractHardcodedTextsCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.extractHardcodedTexts", async () => {
    await mage.execute({ task: "check" });
    let publicCtx = mage.getPublicContext();
    let langDetail = mage.langDetail;
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const projectPath = publicCtx.projectPath.trim().length > 0 ? publicCtx.projectPath : workspacePath;
    if (projectPath.trim() === "") {
      NotificationManager.showWarning(t("command.extractHardcodedTexts.noProjectPath"));
      return;
    }

    const bootstrap = await ensureBootstrapConfig({
      context,
      projectPath,
      hasDetectedLangs: mage.detectedLangList.length > 0
    });
    if (bootstrap === null) return;

    const bootstrapLangPath = path.isAbsolute(bootstrap.languagePath)
      ? bootstrap.languagePath
      : path.join(projectPath, bootstrap.languagePath);
    await mage.execute({
      task: "check",
      projectPath,
      langPath: bootstrapLangPath,
      referredLang: bootstrap.referenceLanguage
    });
    publicCtx = mage.getPublicContext();
    langDetail = mage.langDetail;
    if (mage.detectedLangList.length === 0 || publicCtx.referredLang.trim().length === 0) {
      await ensureBootstrapLangFiles(projectPath, bootstrap);
      await mage.execute({
        task: "check",
        projectPath,
        langPath: bootstrapLangPath,
        referredLang: bootstrap.referenceLanguage
      });
      publicCtx = mage.getPublicContext();
      langDetail = mage.langDetail;
    }
    if (mage.detectedLangList.length === 0 || publicCtx.referredLang.trim().length === 0) {
      NotificationManager.showWarning(t("command.extractHardcodedTexts.noLangPath"));
      return;
    }

    await wrapWithProgress({ title: t("command.extractHardcodedTexts.progress") }, async () => {
      const result = scanHardcodedTextCandidates({
        projectPath,
        sourceLanguage: publicCtx.referredLang,
        scopePath: bootstrap.extractScopePath
      });

      if (result.candidates.length === 0) {
        NotificationManager.showWarning(t("command.extractHardcodedTexts.empty", result.scannedFiles));
        return;
      }

      const referredLang = publicCtx.referredLang;
      const referredMap = langDetail.countryMap[referredLang] ?? {};
      const valueKeyMap = Object.entries(referredMap).reduce(
        (prev, [key, value]) => {
          const id = genIdFromText(value);
          prev[id] ??= [];
          prev[id].push(key);
          return prev;
        },
        {} as Record<string, string[]>
      );
      const functionNames = getConfig<string[]>("i18nFeatures.translationFunctionNames", ["t"]);
      const defaultFuncName = Array.isArray(functionNames) && functionNames[0]?.trim().length ? functionNames[0] : "t";
      const usedKeys = new Set<string>(Object.keys(langDetail.dictionary));
      const generatedTextKeyMap = new Map<string, string>();
      const updatePayloadMap = new Map<string, I18nUpdatePayload>();
      const codePatches: Record<string, FixedTEntry[]> = {};
      const keyPrefix = getConfig<string>("writeRules.keyPrefix", "none");
      const nameSeparator = langDetail.nameSeparator || ".";
      const stopPrefixes = getConfig<string[]>("writeRules.stopPrefixes", []);
      const stopWords = getConfig<string[]>("writeRules.stopWords", []);
      const keyStyle = getConfig("writeRules.keyStyle", "camelCase");
      const maxKeyLength = getConfig<number>("writeRules.maxKeyLength", 40);
      const keyStrategy = getConfig<string>("writeRules.keyStrategy", "english");
      const invalidKeyStrategy = getConfig<string>("writeRules.invalidKeyStrategy", "fallback");
      const manualPrefix = await resolveManualPrefix(context, {
        writeFlag: result.candidates.length > 0,
        keyPrefix,
        nameSeparator,
        avgFileNestedLevel: langDetail.avgFileNestedLevel,
        fileStructure: publicCtx.fileStructure,
        namespaceStrategy: publicCtx.namespaceStrategy,
        classTree: langDetail.classTree
      });
      if (manualPrefix === null) return;

      const uniqueTexts = Array.from(new Set(result.candidates.map(item => item.text)));
      let keySourceNames = [...uniqueTexts];
      const englishTextMap = new Map<string, string>();
      if (keyStrategy === "english" && getLangCode(referredLang) !== "en") {
        NotificationManager.showProgress({ message: t("command.fix.generatingKeyForUndefinedText"), increment: 0 });
        const translated = await translateTo({
          source: referredLang,
          target: "en",
          sourceTextList: uniqueTexts
        });
        if (!translated.success || !translated.data) {
          NotificationManager.showWarning(translated.message ?? t("translator.noAvailableApi"));
          return;
        }
        keySourceNames = translated.data;
        uniqueTexts.forEach((text, index) => {
          englishTextMap.set(text, translated.data?.[index] ?? "");
        });
      } else if (keyStrategy === "pinyin") {
        keySourceNames = uniqueTexts.map(name => pinyin.convertToPinyin(name, " ").replace(/\s+/g, " ").trim());
      } else if (keyStrategy === "english") {
        uniqueTexts.forEach(text => englishTextMap.set(text, text));
      }
      const enLang = mage.detectedLangList.find(lang => getLangCode(lang) === "en") ?? "";

      const generatedNameList = keySourceNames.map(name => genKeyFromText(name, { keyStyle, stopWords }));
      if (invalidKeyStrategy === "ai") {
        const invalidIndexes = generatedNameList
          .map((name, index) => (name.length === 0 || name.length > maxKeyLength ? index : -1))
          .filter(index => index !== -1);
        if (invalidIndexes.length > 0) {
          const aiRes = await generateKeyFrom({
            sourceTextList: invalidIndexes.map(index => uniqueTexts[index]),
            style: keyStyle,
            maxLen: maxKeyLength
          });
          if (aiRes.success && aiRes.data) {
            invalidIndexes.forEach((index, idx) => {
              generatedNameList[index] = aiRes.data?.[idx] ?? generatedNameList[index];
            });
          }
        }
      }
      const generatedNameMap = new Map<string, string>();
      uniqueTexts.forEach((text, index) => {
        generatedNameMap.set(text, generatedNameList[index] || "");
      });

      for (const candidate of result.candidates) {
        const text = candidate.text;
        const textId = genIdFromText(text);
        let key = generatedTextKeyMap.get(text) ?? "";
        if (!key) {
          const matched = valueKeyMap[textId];
          if (Array.isArray(matched) && matched.length > 0) {
            key = matched[0];
          } else {
            const prefix =
              keyPrefix === "manual-selection" ? manualPrefix : getPathPrefix(candidate.file, keyPrefix, stopPrefixes, nameSeparator);
            const baseName = generatedNameMap.get(text) ?? "";
            const checkExisted = (currentKey: string) =>
              usedKeys.has(currentKey) || getValueByAmbiguousEntryName(langDetail.tree, currentKey) !== undefined;
            key = `${prefix}${baseName}`;
            const invalid = baseName.length === 0 || baseName.length > maxKeyLength || checkExisted(key);
            if (invalid) {
              const fileName = candidate.file.match(/([a-zA-Z0-9_-]+)\./)?.[1] ?? "unknown";
              const nameParts = [...splitFileName(fileName).filter(item => !stopWords.includes(item)), "text"];
              const keyLen = getSafeKeyLen(maxKeyLength, prefix);
              let index = 1;
              key = `${prefix}${generateKey([...nameParts, String(index).padStart(2, "0")], keyStyle).slice(-keyLen)}`;
              while (checkExisted(key)) {
                index++;
                key = `${prefix}${generateKey([...nameParts, String(index).padStart(2, "0")], keyStyle).slice(-keyLen)}`;
              }
            }
            usedKeys.add(key);
            generatedTextKeyMap.set(text, key);
            const valueChanges: I18nUpdatePayload["valueChanges"] = {
              [referredLang]: { after: text }
            };
            if (keyStrategy === "english" && enLang && enLang !== referredLang) {
              valueChanges[enLang] = { after: englishTextMap.get(text) ?? text };
            }
            updatePayloadMap.set(key, {
              type: "add",
              key,
              valueChanges
            });
          }
        }

        const relativeFile = toRelativePath(candidate.file);
        const displayKey = internalToDisplayName(unescapeString(key));
        codePatches[relativeFile] ??= [];
        const funcName = candidate.context === "vue-script-string" ? bootstrap.vueScriptFunctionName || defaultFuncName : defaultFuncName;
        codePatches[relativeFile].push({
          id: textId,
          raw: candidate.raw,
          fixedRaw: `${funcName}("${displayKey}")`,
          fixedKey: displayKey,
          addedVars: "",
          pos: `${candidate.start},${candidate.end}`
        });
      }

      const updatePayloads = Array.from(updatePayloadMap.values());
      const previewChanges = getConfig<boolean>("general.previewChanges", true);
      const onComplete = async () => {
        await wrapWithProgress({ title: t("command.extractHardcodedTexts.applying") }, async () => {
          await mage.execute({ task: "check" });
          mage.setPendingChanges(updatePayloads, {});
          await mage.execute({ task: "rewrite" });
          await applyCodePatches(codePatches, { importStatement: bootstrap.importStatement });
          await mage.execute({ task: "check" });
          treeInstance.refresh();
          NotificationManager.showSuccess(
            t(
              "command.extractHardcodedTexts.applied",
              Object.values(codePatches).reduce((acc, cur) => acc + cur.length, 0),
              updatePayloads.length
            )
          );
        });
      };
      const onCancel = async () => {
        await mage.execute({ task: "check" });
        treeInstance.refresh();
      };

      if (!previewChanges) {
        await onComplete();
        return;
      }

      previewFixContent(context, updatePayloads, codePatches, langDetail.countryMap, referredLang, onComplete, onCancel);

      NotificationManager.showSuccess(t("command.extractHardcodedTexts.summary", result.candidates.length, result.scannedFiles));
    });
  });

  registerDisposable(disposable);
}
