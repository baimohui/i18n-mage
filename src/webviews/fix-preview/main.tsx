import { render } from "preact";
import { App } from "./App";
import { FixPreviewData } from "./types";

// 从全局变量获取数据
const data: FixPreviewData = (window as unknown as { webviewData: FixPreviewData }).webviewData;

render(<App data={data} />, document.getElementById("root")!);
