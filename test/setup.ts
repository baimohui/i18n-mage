import mockRequire from "mock-require";

// 使用类型断言，避免 no-unsafe-call 报错
(mockRequire as (moduleName: string, mockExport: unknown) => void)("vscode", {
  workspace: {
    getConfiguration: () => ({
      get: () => ({})
    })
  }
});
