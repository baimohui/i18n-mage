import { render } from "preact";
import { App } from "./App";
import { FixPreviewData } from "./types";
import styles from "./styles.css?inline";

const data: FixPreviewData = (window as unknown as { webviewData: FixPreviewData }).webviewData;

const styleEl = document.createElement("style");
styleEl.textContent = styles;
document.head.appendChild(styleEl);

render(<App data={data} />, document.getElementById("root")!);
