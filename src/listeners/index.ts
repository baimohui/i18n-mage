import * as vscode from "vscode";
import { registerOnFileSave } from "./onFileSave";
import { registerOnActiveEditorChange } from "./onActiveEditorChange";
import { registerOnConfigChange } from "./onConfigChange";
import { registerOnEditorSelectionChange } from "./onEditorSelectionChange";
import { registerOnFileChange } from "./onFileChange";
import { registerOnEditorVisibleRangesChange } from "./onEditorVisibleRangesChange";
import { registerOnDocumentOpen } from "./onDocumentOpen";
import { registerOnDocumentClose } from "./onDocumentClose";

export function registerAllListeners(context: vscode.ExtensionContext) {
  registerOnFileSave();
  registerOnActiveEditorChange();
  registerOnConfigChange();
  registerOnEditorSelectionChange(context);
  registerOnFileChange();
  registerOnEditorVisibleRangesChange();
  registerOnDocumentOpen();
  registerOnDocumentClose();
}
