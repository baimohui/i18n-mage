const vscode = require("vscode");
const path = require("path");
const { treeProvider } = require("./tree");
const LangCheckRobot = require("./langCheckRobot");
const { getPossibleLangDirList } = require("./utils/fs");
const previewFixContent = require("./previewBeforeFix");

let isProcessing = false;
let treeInstance;
/**
 * 插件被激活时触发，所有代码总入口
 * @param {*} context 插件上下文
 */
exports.activate = async function (context) {
  const rootPath = vscode.workspace.workspaceFolders?.length > 0 ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
  const config = vscode.workspace.getConfiguration("i18n-mage");
  const globalConfig = vscode.workspace.getConfiguration();
  const robot = LangCheckRobot.getInstance();
  robot.setOptions({
    // checkAimList,
    // excludedLangList,
    // includedLangList,
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
  async function getLangDir() {
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
  if (!(await getLangDir())) return;
  treeInstance = new treeProvider();
  vscode.window.registerTreeDataProvider("treeProvider", treeInstance);
  // 等待数据初始化完成后设置标志位
  treeInstance.isInitialized = true;
  treeInstance.onActiveEditorChanged(); // 手动触发一次更新

  vscode.commands.registerCommand("i18nMage.setReferredLang", lang => {
    startProgress({
      title: "",
      callback: async () => {
        globalConfig.update("i18n-mage.referenceLanguage", lang.key, vscode.ConfigurationTarget.Workspace);
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
  vscode.commands.registerCommand("i18nMage.ignoreFile", e => {
    startProgress({
      title: "刷新中...",
      callback: async () => {
        const config = vscode.workspace.getConfiguration("i18n-mage");
        const ignoredFileList = (config.ignoredFileList || []).concat(path.relative(rootPath, e.resourceUri.fsPath));
        await globalConfig.update("i18n-mage.ignoredFileList", ignoredFileList, vscode.ConfigurationTarget.Workspace);
        robot.setOptions({ task: "check", globalFlag: true, clearCache: true, ignoredFileList });
        const res = await robot.execute();
        !res && (await getLangDir());
      }
    });
  });
  vscode.commands.registerCommand("i18nMage.copyName", async e => {
    if (!e || !e.label) return;
    await vscode.env.clipboard.writeText(String(e.label));
    vscode.window.showInformationMessage(`已复制：${e.label}`);
  });
  vscode.commands.registerCommand("i18nMage.copyValue", async e => {
    if (!e || !e.description) return;
    await vscode.env.clipboard.writeText(String(e.description));
    vscode.window.showInformationMessage(`已复制：${e.description}`);
  });
  vscode.commands.registerCommand("i18nMage.editValue", async e => {
    if (!e || !e.data) return;
    const newLabel = await vscode.window.showInputBox({
      prompt: "编辑文本",
      value: e.description // 默认值为当前文本
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
      const success = robot.execute();
      if (success) {
        e.description = newLabel; // 更新 TreeItem 文本
        treeInstance.refresh(); // 刷新 TreeView
        // await vscode.env.clipboard.writeText(String(e.description));
        vscode.window.showInformationMessage(`已写入：${newLabel}`);
      }
    }
  });
  vscode.commands.registerCommand("i18nMage.deleteUnusedEntries", async e => {
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
        treeInstance.refresh(); // 刷新 TreeView
        vscode.window.showInformationMessage(`已删除`);
      }
    }
  });
  vscode.commands.registerCommand("i18nMage.openFileAtPosition", async e => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("没有活动的编辑器");
      return;
    }
    const resourceUri = editor.document.uri;
    if (e.usedInfo) {
      const matchedPath = Object.keys(e.usedInfo).find(filePath => vscode.Uri.file(filePath).fsPath === resourceUri.fsPath);
      const document = await vscode.workspace.openTextDocument(resourceUri);
      const pos = document.positionAt(e.usedInfo[matchedPath][0]);
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
                treeInstance.refresh(); // 刷新 TreeView
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
    const options = {
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
    const options = {
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
                  treeInstance.refresh(); // 刷新 TreeView
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
    // const panel = vscode.window.createWebviewPanel("excelUpload", "Excel Upload", vscode.ViewColumn.One, {
    //   enableScripts: true
    // });

    // panel.webview.html = getWebviewContent(context, "src/view/handle-excel.html");

    // panel.webview.onDidReceiveMessage(
    //   async message => {
    //     switch (message.command) {
    //       case "upload":
    //         // const workbook = xlsx.read(new Uint8Array(message.data), { type: "array" });
    //         // 处理读取的 Excel 数据
    //         vscode.window.showInformationMessage("Excel 文件已上传");
    //         break;
    //       case "export":
    //         // const wb = xlsx.utils.book_new();
    //         // const ws = xlsx.utils.aoa_to_sheet([
    //         //   ["Header1", "Header2"],
    //         //   ["Data1", "Data2"]
    //         // ]);
    //         // xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
    //         // const buffer = xlsx.write(wb, { bookType: "xlsx", type: "buffer" });
    //         // const filePath = vscode.Uri.file(`${vscode.workspace.rootPath}/export.xlsx`);
    //         // await fs.promises.writeFile(filePath.fsPath, buffer);
    //         vscode.window.showInformationMessage("Excel 文件已导出");
    //         break;
    //     }
    //   },
    //   undefined,
    //   context.subscriptions
    // );
  });

  vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration("i18n-mage")) return;
    const config = vscode.workspace.getConfiguration("i18n-mage");
    if (event.affectsConfiguration("i18n-mage.syncBasedOnReferredEntries")) {
      robot.setOptions({ syncBasedOnReferredEntries: config.syncBasedOnReferredEntries });
      vscode.commands.executeCommand("i18nMage.setReferredLang", robot.referredLang);
    }
  });

  // require('./helloword')(context); // helloworld
  // require('./test-command-params')(context); // 测试命令参数
  // require('./test-menu-when')(context); // 测试菜单 when 命令
  // require('./jump-to-definition')(context); // 跳转到定义
  // require('./completion')(context); // 自动补全
  // require('./hover')(context); // 悬停提示
  // require('./welcome')(context); // 欢迎提示
  // require('./other')(context); // 其它杂七杂八演示代码

  // const testFn = require('./test-require-function');
  // console.log(testFn); // vscode 的日志输出不可靠，这里竟然会打印 null？！
  // testFn(1, 2);

  // 自动提示演示，在 dependencies 后面输入。会自动带出依赖
  // this.dependencies.
};

function startProgress({ title, callback }) {
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
