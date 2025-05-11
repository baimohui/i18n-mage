import * as vscode from "vscode";
import * as path from "path";
import { TreeProvider } from "./tree";
import LangCheckRobot from "./langCheckRobot";
import { getPossibleLangDirList } from "./utils/fs";
import previewFixContent from "./previewBeforeFix";

let isProcessing = false;
let treeInstance: TreeProvider;

/**
 * 插件被激活时触发，所有代码总入口
 * @param context 插件上下文
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const rootPath = vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
  const config = vscode.workspace.getConfiguration("i18n-mage");
  const globalConfig = vscode.workspace.getConfiguration();
  const robot = LangCheckRobot.getInstance();

  robot.setOptions({
    rootPath,
    referredLang: config.referenceLanguage,
    ignoredFileList: config.ignoredFileList,
    langFileMinLength: config.langFileMinLength,
    ignoreEmptyLangFile: config.ignoreEmptyLangFile,
    sortWithTrim: config.sortWithTrim,
    credentials: {
      baiduAppId: config.baiduAppId,
      baiduSecretKey: config.baiduSecretKey,
      tencentSecretId: config.tencentSecretId,
      tencentSecretKey: config.tencentSecretKey,
      translateApiPriority: config.translateApiPriority
    },
    syncBasedOnReferredEntries: config.syncBasedOnReferredEntries
  });

  async function getLangDir(): Promise<boolean> {
    if (!rootPath) {
      vscode.window.showErrorMessage("No workspace opened");
      return false;
    }
    const possibleLangDirs = getPossibleLangDirList(rootPath);
    for (const langDir of possibleLangDirs) {
      robot.setOptions({ langDir, task: "check", globalFlag: true, clearCache: false });
      await robot.execute();
      if (robot.detectedLangList.length > 0) {
        break;
      }
    }
    if (robot.detectedLangList.length === 0) {
      vscode.window.showInformationMessage("No lang dir in workspace");
      return false;
    }
    return true;
  }

  // if (!(await getLangDir())) return;
  await getLangDir();
  treeInstance = new TreeProvider();
  vscode.window.registerTreeDataProvider("treeProvider", treeInstance);
  treeInstance.isInitialized = true;
  treeInstance.onActiveEditorChanged();

  vscode.commands.registerCommand("i18nMage.setReferredLang", async (lang: { key: string }) => {
    startProgress({
      title: "",
      callback: async () => {
        await globalConfig.update("i18n-mage.referenceLanguage", lang.key, vscode.ConfigurationTarget.Workspace);
        robot.setOptions({ referredLang: lang.key, task: "check", globalFlag: false, clearCache: false });
        await robot.execute();
      }
    });
  });

  vscode.commands.registerCommand("i18nMage.checkUsage", () => {
    startProgress({
      title: "检查中...",
      callback: async () => {
        const config = vscode.workspace.getConfiguration("i18n-mage");
        robot.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
        const res = await robot.execute();
        !res && (await getLangDir());
      }
    });
  });

  vscode.commands.registerCommand("i18nMage.ignoreFile", (e: vscode.TreeItem) => {
    startProgress({
      title: "刷新中...",
      callback: async () => {
        const config = vscode.workspace.getConfiguration("i18n-mage");
        const ignoredFileList = (config.ignoredFileList || []).concat(path.relative(rootPath!, e.resourceUri!.fsPath));
        await globalConfig.update("i18n-mage.ignoredFileList", ignoredFileList, vscode.ConfigurationTarget.Workspace);
        robot.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList });
        const res = await robot.execute();
        !res && (await getLangDir());
      }
    });
  });

  vscode.commands.registerCommand("i18nMage.copyName", async (e: vscode.TreeItem) => {
    if (!e || !e.label) return;
    await vscode.env.clipboard.writeText(String(e.label));
    vscode.window.showInformationMessage(`已复制：${e.label}`);
  });

  vscode.commands.registerCommand("i18nMage.copyValue", async (e: vscode.TreeItem) => {
    if (!e || !e.description) return;
    await vscode.env.clipboard.writeText(String(e.description));
    vscode.window.showInformationMessage(`已复制：${e.description}`);
  });

  vscode.commands.registerCommand("i18nMage.editValue", async (e: vscode.TreeItem & { data: { name: string; lang: string } }) => {
    if (!e || !e.data) return;
    const newLabel = await vscode.window.showInputBox({
      prompt: "编辑文本",
      value: e.description as string
    });
    if (newLabel) {
      const { name, lang } = e.data;
      robot.setOptions({
        task: "modify",
        modifyList: [{ name, lang, value: newLabel }],
        globalFlag: false,
        clearCache: false,
        rewriteFlag: true
      });
      const success = await robot.execute();
      if (success) {
        e.description = newLabel;
        treeInstance.refresh();
        vscode.window.showInformationMessage(`已写入：${newLabel}`);
      }
    }
  });

  vscode.commands.registerCommand(
    "i18nMage.deleteUnusedEntries",
    async (e: vscode.TreeItem & { data: { unescaped: string; escaped: string }[] }) => {
      if (!e || !e.label || !e.data || e.data.length === 0) return;
      const confirmDelete = await vscode.window.showWarningMessage(
        "确定删除吗？",
        { modal: true, detail: `将删除词条：${e.data.map(item => item.unescaped).join(", ")}` },
        { title: "确定" },
        { title: "取消" }
      );
      if (confirmDelete?.title === "确定") {
        robot.setOptions({
          task: "trim",
          trimNameList: e.data.map(item => item.escaped),
          globalFlag: false,
          clearCache: false,
          rewriteFlag: true
        });
        const success = await robot.execute();
        if (success) {
          robot.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList: config.ignoredFileList });
          await robot.execute();
          treeInstance.refresh();
          vscode.window.showInformationMessage(`已删除`);
        }
      }
    }
  );

  vscode.commands.registerCommand("i18nMage.openFileAtPosition", async (e: { usedInfo: Record<string, number[]>; label: string }) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("没有活动的编辑器");
      return;
    }
    const resourceUri = editor.document.uri;
    if (e.usedInfo) {
      const matchedPath = Object.keys(e.usedInfo).find(filePath => vscode.Uri.file(filePath).fsPath === resourceUri.fsPath);
      const document = await vscode.workspace.openTextDocument(resourceUri);
      const pos = document.positionAt(e.usedInfo[matchedPath!][0]);
      const selection = new vscode.Range(pos, pos.translate(0, e.label.length));
      vscode.window.showTextDocument(resourceUri, { selection });
    }
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
              vscode.window.showErrorMessage("No updated entries found.");
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
    if (fileUri && fileUri[0]) {
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
                vscode.window.showErrorMessage("No updated entries found.");
              }
            }
          }
        }
      });
    }
  });

  vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration("i18n-mage")) return;
    const config = vscode.workspace.getConfiguration("i18n-mage");
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
