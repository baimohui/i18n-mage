// import * as assert from "assert";
// import * as sinon from "sinon";
// import * as vscode from "vscode";
// import { activate } from "@/extension";
// import { treeInstance } from "@/views/tree";
// import { DecoratorController } from "@/features/Decorator";
// import { wrapWithProgress } from "@/utils/wrapWithProgress";
// import { NotificationManager } from "@/utils/notification";

// describe("extension 激活测试", () => {
//   let sandbox: sinon.SinonSandbox;
//   let mockContext: vscode.ExtensionContext;
//   let mockEditor: vscode.TextEditor;

//   beforeEach(() => {
//     sandbox = sinon.createSandbox();

//     // 创建模拟上下文
//     mockContext = {
//       subscriptions: [],
//       globalState: { get: sandbox.stub(), update: sandbox.stub() }
//     } as unknown as vscode.ExtensionContext;

//     // 模拟 VS Code API
//     sandbox.stub(vscode.window, "registerTreeDataProvider");
//     sandbox.stub(vscode.window, "activeTextEditor").get(() => mockEditor);

//     // 模拟依赖模块
//     sandbox.stub(NotificationManager, "init");
//     sandbox.stub(treeInstance, "initTree").resolves();
//     sandbox.stub(DecoratorController, "getInstance").returns({
//       update: sandbox.stub()
//     } as unknown as DecoratorController);
//     sandbox.stub(wrapWithProgress, "call").resolves();
//   });

//   afterEach(() => {
//     sandbox.restore();
//   });

//   it("应该初始化所有核心组件", async () => {
//     await activate(mockContext);

//     assert.ok(NotificationManager.init.calledOnce);
//     assert.ok(vscode.window.registerTreeDataProvider.calledWith("i18nMage.grimoire", treeInstance));
//     assert.ok(treeInstance.initTree.calledOnce);
//   });

//   it("应该正确绑定所有 disposable", async () => {
//     await activate(mockContext);

//     assert.ok(mockContext.subscriptions.length > 0, "应该向上下文添加订阅");
//   });

//   it("当有活跃编辑器时应该更新装饰器", async () => {
//     mockEditor = {} as vscode.TextEditor;
//     await activate(mockContext);

//     const decorator = DecoratorController.getInstance();
//     assert.ok(decorator.update.calledWith(mockEditor));
//   });

//   it("当没有活跃编辑器时不应更新装饰器", async () => {
//     mockEditor = undefined;
//     await activate(mockContext);

//     const decorator = DecoratorController.getInstance();
//     assert.ok(decorator.update.notCalled);
//   });

//   it("应该用进度条包装初始化过程", async () => {
//     await activate(mockContext);

//     assert.ok(wrapWithProgress.calledOnce);
//     const [options, callback] = wrapWithProgress.firstCall.args;
//     assert.deepStrictEqual(options, { title: "common.init.progress" });
//     assert.ok(callback instanceof Function);
//   });
// });
