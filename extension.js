// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "i18n-checker" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand('i18n-checker.sayHello', function (uri) {
    // The code you place here will be executed every time your command is executed

    // Display a message box to the user
    vscode.window.showInformationMessage('Hello:', uri ? uri.path : "null");
  });

  let disposable2 = vscode.commands.registerCommand('i18n-checker.checkLang', function () {
    const time = new Date()
    vscode.window.showWarningMessage('准备开启检测，时间' + time);
  })

  context.subscriptions.push(...[disposable, disposable2]);

  // 编辑器命令
  context.subscriptions.push(vscode.commands.registerTextEditorCommand('i18n-checker.testEditorCommand', (textEditor, edit) => {
    console.log('您正在执行编辑器命令！');
    console.log(textEditor, edit);
  }));

  // 注册如何实现跳转到定义，第一个参数表示仅对 json 文件生效
  context.subscriptions.push(vscode.languages.registerDefinitionProvider(['json'], {
    provideDefinition: (document, position, token) => {
      const fileName = document.fileName;
      const workDir = path.dirname(fileName);
      const word = document.getText(document.getWordRangeAtPosition(position));
      const line = document.lineAt(position);

      console.log('====== 进入 provideDefinition 方法 ======');
      console.log('fileName: ' + fileName); // 当前文件完整路径
      console.log('workDir: ' + workDir); // 当前文件所在目录
      console.log('word: ' + word); // 当前光标所在单词
      console.log('line: ' + line.text); // 当前光标所在行));

      if (/\\package\.json$/.test(fileName)) {
        const json = document.getText();
        console.log("=================文件匹配：", word, line.text);
        if (new RegExp(`"(dependencies|devDependencies)":\\s*?\\{[\\s\\S]*?${word.replace(/\//g, '\\/')}[\\s\\S]*?\\}`, 'gm').test(json)) {
          let destPath = `${workDir}\\node_modules\\${word.replace(/"/g, '')}\\package.json`;
          console.log("🚀 ~ activate ~ destPath:", destPath)
          if (fs.existsSync(destPath)) {
            // new vscode.Position(0, 0) 表示跳转到某个文件的第一行第一列
            return new vscode.Location(vscode.Uri.file(destPath), new vscode.Position(0, 0));
          }
        }
      }
    }
  }))

  /**
    * 鼠标悬停提示，当鼠标停在 package.json 的 dependencies 或者 devDependencies 时，
    * 自动显示对应包的名称、版本号和许可协议
    * @param {*} document 
    * @param {*} position 
    * @param {*} token 
    */
  context.subscriptions.push(vscode.languages.registerHoverProvider('json', {
    provideHover:
      function provideHover(document, position, token) {
        const fileName = document.fileName;
        const workDir = path.dirname(fileName);
        const word = document.getText(document.getWordRangeAtPosition(position));

        if (/\\package\.json$/.test(fileName)) {
          console.log('进入 provideHover 方法');
          const json = document.getText();
          if (new RegExp(`"(dependencies|devDependencies)":\\s*?\\{[\\s\\S]*?${word.replace(/\//g, '\\/')}[\\s\\S]*?\\}`, 'gm').test(json)) {
            let destPath = `${workDir}\\node_modules\\${word.replace(/"/g, '')}\\package.json`;
            if (fs.existsSync(destPath)) {
              const content = require(destPath);
              console.log('hover 已生效');
              // hover 内容支持 markdown 语法
              return new vscode.Hover(`* **名称**：${content.name}\n* **版本**：${content.version}\n* **许可协议**：${content.license}`);
            }
          }
        }
      }
  }));

}

// This method is called when your extension is deactivated
function deactivate() { }

module.exports = {
  activate,
  deactivate
}
