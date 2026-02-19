import { render } from "preact";
import { App } from "./App";
import { ExtractSetupWebviewData } from "./types";
import styles from "./styles.css?inline";

const data: ExtractSetupWebviewData = (window as unknown as { webviewData: ExtractSetupWebviewData }).webviewData;

const styleEl = document.createElement("style");
styleEl.textContent = styles;
document.head.appendChild(styleEl);

render(<App data={data} />, document.getElementById("root")!);
