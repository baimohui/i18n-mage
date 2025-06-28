import { registerOnFileSave } from "./onFileSave";
import { registerOnActiveEditorChange } from "./onActiveEditorChange";
import { registerOnConfigChange } from "./onConfigChange";
import { registerOnEditorSelectionChange } from "./onEditorSelectionChange";
import { registerOnFileChange } from "./onFileChange";
import { registerOnEditorVisibleRangesChange } from "./onEditorVisibleRangesChange";
import { registerOnDocumentOpen } from "./onDocumentOpen";
import { registerOnDocumentClose } from "./onDocumentClose";

export function registerAllListeners() {
  registerOnFileSave();
  registerOnActiveEditorChange();
  registerOnConfigChange();
  registerOnEditorSelectionChange();
  registerOnFileChange();
  registerOnEditorVisibleRangesChange();
  registerOnDocumentOpen();
  registerOnDocumentClose();
}
