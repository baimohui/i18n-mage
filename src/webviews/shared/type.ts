export interface VSCodeAPI {
  postMessage(message: any): void;
  setState(state: any): void;
  getState(): any;
}

declare global {
  interface Window {
    acquireVsCodeApi(): VSCodeAPI;
  }
}

export interface WebviewMessage {
  type: string;
  data: any;
}
