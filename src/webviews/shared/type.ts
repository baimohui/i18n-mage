export interface VSCodeAPI {
  postMessage(message: unknown): void;
  setState(state: unknown): void;
  getState(): unknown;
}

declare global {
  interface Window {
    acquireVsCodeApi(): VSCodeAPI;
  }
}

export interface WindowApi {
  acquireVsCodeApi(): VSCodeAPI;
  webviewData: { language: string };
}
