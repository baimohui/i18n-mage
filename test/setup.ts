import mockRequire from "mock-require";

// 使用类型断言，避免 no-unsafe-call 报错
(mockRequire as (moduleName: string, mockExport: unknown) => void)("vscode", {
  workspace: {
    getConfiguration: () => ({
      get: (key: string, defaultValue?: unknown) => {
        switch (key) {
          case "translationServices.langAliasCustomMappings":
            return {
              "zh-cn": ["custom-cn", "my-zh"]
            };
          case "writeRules.enableKeyTagRule":
          case "writeRules.enablePrefixTagRule":
            return true;
        }
        return defaultValue ?? {};
      }
    })
  },
  l10n: {
    t: (key: string, ...args: string[]) => {
      if (args.length) {
        return key.replace(/\{(\d+)\}/g, (_, i: number) => args[i]);
      }
      return key;
    }
  }
});
