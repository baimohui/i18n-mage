import { VSCodeAPI } from "./type";

export function createNonce(): string {
  return Array.from(
    { length: 32 },
    () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]
  ).join("");
}

let _cachedVscodeApi: VSCodeAPI | null = null;

export function getVSCodeAPI() {
  if (_cachedVscodeApi) return _cachedVscodeApi;
  if (typeof window === "undefined") return null;
  if (typeof (window as { acquireVsCodeApi: () => VSCodeAPI }).acquireVsCodeApi !== "function") return null;

  try {
    _cachedVscodeApi = (window as { acquireVsCodeApi: () => VSCodeAPI }).acquireVsCodeApi();
    return _cachedVscodeApi;
  } catch (err) {
    console.error("Failed to acquire VS Code API:", err);
    // 不抛出，让调用方能处理 null
    return null;
  }
}
