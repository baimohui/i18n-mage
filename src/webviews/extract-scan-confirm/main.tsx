import { render } from "preact";
import { App } from "./App";
import { ExtractScanConfirmData } from "./types";
import styles from "./styles.css?inline";

declare global {
  interface Window {
    webviewData: ExtractScanConfirmData;
  }
}

const styleTag = document.createElement("style");
styleTag.textContent = styles;
document.head.appendChild(styleTag);

render(<App data={window.webviewData} />, document.getElementById("root")!);
