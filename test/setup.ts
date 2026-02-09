/* eslint-disable @typescript-eslint/no-require-imports */
import mockRequire from "mock-require";
import { vscodeMock, resetConfigStore, seedDefaultConfig } from "./helpers/vscodeMock";

// 使用类型断言，避免 no-unsafe-call 报错
(mockRequire as (moduleName: string, mockExport: unknown) => void)("vscode", vscodeMock);

// 需要在 mock 之后再加载依赖 vscode 的模块
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { clearConfigCache } = require("@/utils/config") as typeof import("@/utils/config");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NotificationManager } = require("@/utils/notification") as typeof import("@/utils/notification");

// 保持每个测试文件初始配置一致
beforeEach(() => {
  resetConfigStore();
  seedDefaultConfig();
  clearConfigCache("");
  NotificationManager.init();
});
