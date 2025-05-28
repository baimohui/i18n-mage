import * as vscode from "vscode";
import * as path from "path";
import { TreeProvider, PluginConfiguration } from "./tree";
import LangCheckRobot from "./langCheckRobot";
import previewFixContent from "./previewBeforeFix";
import { LANG_INTRO_MAP, getLangIntro } from "./utils/const";
import { getFileLocationFromId, selectProperty, formatForFile } from "./utils/regex";

let isProcessing = false;
let treeInstance: TreeProvider;

/**
 * 插件被激活时触发，所有代码总入口
 * @param context 插件上下文
 */
export function activate(): void {
  const config = vscode.workspace.getConfiguration("i18n-mage") as PluginConfiguration;
  const globalConfig = vscode.workspace.getConfiguration();
  const robot = LangCheckRobot.getInstance();

  treeInstance = new TreeProvider();
  vscode.window.registerTreeDataProvider("treeProvider", treeInstance);
  startProgress({
    title: "初始化中...",
    callback: async () => {
      await treeInstance.initTree();
    }
  });

  vscode.commands.registerCommand("i18nMage.setReferredLang", (lang: { key: string }) => {
    startProgress({
      title: "",
      callback: async (): Promise<void> => {
        await globalConfig.update("i18n-mage.referenceLanguage", lang.key, vscode.ConfigurationTarget.Workspace);
        robot.setOptions({ referredLang: lang.key, task: "check", globalFlag: false, clearCache: false });
        await robot.execute();
      }
    });
  });

  vscode.commands.registerCommand("i18nMage.markAsKnownLanguage", async ({ key: langKey }) => {
    try {
      const reverseMap: Record<string, string> = {};
      const languageList = Object.entries(LANG_INTRO_MAP)
        .map(([key, info]) => {
          reverseMap[info.cnName] = key;
          return info.cnName;
        })
        .filter(cnName => robot.detectedLangList.every(i => getLangIntro(i)?.cnName !== cnName));
      const selectedText = await vscode.window.showQuickPick(languageList, {
        placeHolder: `标记 ${langKey} 所属语言`
      });
      if (typeof selectedText === "string" && selectedText.trim()) {
        const selectedKey = reverseMap[selectedText];
        const config = vscode.workspace.getConfiguration("i18n-mage");
        const mappings = config.get<Record<string, string[]>>("langAliasCustomMappings") || {};
        const aliases = new Set(mappings[selectedKey] ?? []);
        if (!aliases.has(langKey as string)) {
          aliases.add(langKey as string);
          await config.update(
            "langAliasCustomMappings",
            { ...mappings, [selectedKey]: Array.from(aliases) },
            vscode.ConfigurationTarget.Global
          );
          vscode.window.showInformationMessage(`已添加映射：${langKey} → ${selectedText}`);
        } else {
          vscode.window.showWarningMessage(`[${langKey}] 已存在于 ${selectedText} 的别名列表`);
        }
      }
    } catch (err) {
      vscode.window.showErrorMessage(`标记失败：${err instanceof Error ? err.message : "发生未知错误"}`);
    }
  });

  vscode.commands.registerCommand("i18nMage.checkUsage", () => {
    startProgress({
      title: "检查中...",
      callback: async () => {
        const config = vscode.workspace.getConfiguration("i18n-mage");
        const ignoredFileList = config.ignoredFileList as string[]; // Ensure proper typing
        robot.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList });
        const res = await robot.execute();
        if (!res) {
          await treeInstance.initTree();
        }
      }
    });
  });

  vscode.commands.registerCommand("i18nMage.ignoreFile", (e: vscode.TreeItem) => {
    startProgress({
      title: "刷新中...",
      callback: async () => {
        const config = vscode.workspace.getConfiguration("i18n-mage") as PluginConfiguration;
        const ignoredFileList = (config.ignoredFileList ?? []).concat(path.relative(robot.rootPath, e.resourceUri!.fsPath));
        await globalConfig.update("i18n-mage.ignoredFileList", ignoredFileList, vscode.ConfigurationTarget.Workspace);
        robot.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList });
        const res = await robot.execute();
        if (!res) {
          await treeInstance.initTree();
        }
      }
    });
  });

  vscode.commands.registerCommand("i18nMage.copyKeyValueList", async (e: vscode.TreeItem & { data: { name: string; value: string }[] }) => {
    const content = e.data.map(i => `${formatForFile(i.name)}: ${formatForFile(i.value)},`).join("\n");
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage(`已复制：${content}`);
  });

  vscode.commands.registerCommand("i18nMage.copyName", async (e: vscode.TreeItem) => {
    if (typeof e.label !== "string" || e.label.trim() === "") return;
    await vscode.env.clipboard.writeText(e.label);
    vscode.window.showInformationMessage(`已复制：${e.label}`);
  });

  vscode.commands.registerCommand("i18nMage.copyValue", async (e: vscode.TreeItem) => {
    if (typeof e.description !== "string" || e.description.trim() === "") return;
    await vscode.env.clipboard.writeText(String(e.description));
    vscode.window.showInformationMessage(`已复制：${e.description}`);
  });

  vscode.commands.registerCommand(
    "i18nMage.editValue",
    async (e: vscode.TreeItem & { data: { name: string; key: string; value: string; lang: string } }) => {
      if (typeof e.data !== "object" || Object.keys(e.data).length === 0) return;
      const { name, value, lang } = e.data;
      const newValue = await vscode.window.showInputBox({
        prompt: `修改 ${name} 的 ${lang} 值`,
        value
      });
      if (typeof newValue === "string" && newValue !== value && newValue.trim() !== "") {
        robot.setOptions({
          task: "modify",
          modifyList: [{ ...e.data, value: newValue }],
          globalFlag: false,
          clearCache: false,
          rewriteFlag: true
        });
        const success = await robot.execute();
        if (success) {
          e.description = newValue;
          treeInstance.refresh();
          vscode.window.showInformationMessage(`已写入：${newValue}`);
        }
      }
    }
  );

  vscode.commands.registerCommand(
    "i18nMage.deleteUnusedEntries",
    async (e: vscode.TreeItem & { data: { name: string; key: string }[] }) => {
      if (typeof e.label !== "string" || e.label.trim() === "" || !Array.isArray(e.data) || e.data.length === 0) return;
      const confirmDelete = await vscode.window.showWarningMessage(
        "确定删除吗？",
        { modal: true, detail: `将删除词条：${e.data.map(item => item.name).join(", ")}` },
        { title: "确定" }
      );
      if (confirmDelete?.title === "确定") {
        robot.setOptions({
          task: "trim",
          trimKeyList: e.data.map(item => item.key),
          globalFlag: false,
          clearCache: false,
          rewriteFlag: true
        });
        const success = await robot.execute();
        if (success) {
          robot.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
          await robot.execute();
          treeInstance.refresh();
          vscode.window.showInformationMessage("删除成功");
        }
      }
    }
  );

  vscode.commands.registerCommand("i18nMage.goToReference", async (e: { usedInfo: Record<string, number[]>; label: string }) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("没有活动的编辑器");
      return;
    }
    const resourceUri = editor.document.uri;
    if (typeof e.usedInfo === "object" && Object.keys(e.usedInfo).length > 0) {
      const matchedPath = Object.keys(e.usedInfo).find(filePath => vscode.Uri.file(filePath).fsPath === resourceUri.fsPath);
      const document = await vscode.workspace.openTextDocument(resourceUri);
      const pos = document.positionAt(e.usedInfo[matchedPath!][0]);
      const selection = new vscode.Range(pos, pos.translate(0, e.label.length));
      vscode.window.showTextDocument(resourceUri, { selection });
    }
  });

  vscode.commands.registerCommand("i18nMage.goToDefinition", async (e: { data: { key: string; lang: string } }) => {
    const { key, lang } = e.data;
    let filePathSegs: string[] = [];
    if (robot.fileStructure?.children) {
      filePathSegs = getFileLocationFromId(key, robot.fileStructure.children[lang]) ?? [];
    }
    const realKey = filePathSegs.length > 0 ? key.replace(`${filePathSegs.join(".")}.`, "") : key;
    const resourceUri = vscode.Uri.file(path.join(robot.langDir, lang, ...filePathSegs) + `.${robot.langFileType}`);
    await selectProperty(resourceUri, realKey);
  });

  vscode.commands.registerCommand("i18nMage.sort", () => {
    startProgress({
      title: "排序中...",
      callback: async () => {
        robot.setOptions({ task: "sort", globalFlag: true, rewriteFlag: true });
        const success = await robot.execute();
        if (success) {
          vscode.window.showInformationMessage("Sort success");
        }
      }
    });
  });

  vscode.commands.registerCommand("i18nMage.fix", () => {
    startProgress({
      title: "修复中...",
      callback: async () => {
        const rewriteFlag = !config.previewBeforeFix;
        robot.setOptions({ task: "fix", globalFlag: true, rewriteFlag });
        const success = await robot.execute();
        if (success) {
          if (rewriteFlag) {
            robot.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
            await robot.execute();
            vscode.window.showInformationMessage("Fix success");
          } else {
            const { updatedValues, patchedIds, countryMap } = robot.langDetail;
            if ([updatedValues, patchedIds].some(item => Object.keys(item).length > 0)) {
              previewFixContent(updatedValues, patchedIds, countryMap, robot.referredLang, async () => {
                robot.setOptions({ task: "rewrite" });
                await robot.execute();
                robot.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
                await robot.execute();
                treeInstance.refresh();
                vscode.window.showInformationMessage("Fix success");
              });
            } else {
              vscode.window.showWarningMessage("No updated entries found.");
            }
          }
        }
      }
    });
  });

  vscode.commands.registerCommand("i18nMage.export", async () => {
    const options: vscode.SaveDialogOptions = {
      saveLabel: "Save Excel file",
      filters: {
        "Excel files": ["xlsx", "xls"]
      }
    };
    const fileUri = await vscode.window.showSaveDialog(options);
    if (fileUri) {
      startProgress({
        title: "导出中...",
        callback: async () => {
          const filePath = fileUri.fsPath;
          robot.setOptions({ task: "export", exportExcelTo: filePath });
          const success = await robot.execute();
          if (success) {
            vscode.window.showInformationMessage("Export success");
          }
        }
      });
    }
  });

  vscode.commands.registerCommand("i18nMage.import", async () => {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: "Select Excel file",
      filters: {
        "Excel files": ["xlsx", "xls"]
      }
    };
    const fileUri = await vscode.window.showOpenDialog(options);
    if (Array.isArray(fileUri) && fileUri.length > 0) {
      startProgress({
        title: "导入中...",
        callback: async () => {
          const rewriteFlag = !config.previewBeforeFix;
          const filePath = fileUri[0].fsPath;
          robot.setOptions({ task: "import", importExcelFrom: filePath, rewriteFlag });
          const success = await robot.execute();
          if (success) {
            if (rewriteFlag) {
              robot.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
              await robot.execute();
              vscode.window.showInformationMessage("Import success");
            } else {
              const { updatedValues, patchedIds, countryMap } = robot.langDetail;
              if ([updatedValues, patchedIds].some(item => Object.keys(item).length > 0)) {
                previewFixContent(updatedValues, patchedIds, countryMap, robot.referredLang, async () => {
                  robot.setOptions({ task: "rewrite" });
                  await robot.execute();
                  robot.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
                  await robot.execute();
                  treeInstance.refresh();
                  vscode.window.showInformationMessage("Import success");
                });
              } else {
                vscode.window.showWarningMessage("No updated entries found.");
              }
            }
          }
        }
      });
    }
  });

  vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration("i18n-mage")) return;
    const config = vscode.workspace.getConfiguration("i18n-mage") as PluginConfiguration;
    if (event.affectsConfiguration("i18n-mage.syncBasedOnReferredEntries")) {
      robot.setOptions({ syncBasedOnReferredEntries: config.syncBasedOnReferredEntries });
      vscode.commands.executeCommand("i18nMage.setReferredLang", robot.referredLang);
    }
  });
}

function startProgress({ title, callback }: { title: string; callback: () => Promise<void> }): void {
  if (isProcessing) {
    vscode.window.showWarningMessage("Already processing. Please wait.");
    return;
  }
  vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, async () => {
    isProcessing = true;
    await callback();
    isProcessing = false;
    treeInstance.refresh();
  });
}
