import { registerOnFileSave } from "./onFileSave";
import { registerOnActiveEditorChange } from "./onActiveEditorChange";
import { registerOnConfigChange } from "./onConfigChange";
import { registerOnEditorSelectionChange } from "./onEditorSelectionChange";
import { registerOnFileChange } from "./onFileChange";
import { registerOnEditorVisibleRangesChange } from "./onEditorVisibleRangesChange";

export function registerAllListeners() {
  registerOnFileSave();
  registerOnActiveEditorChange();
  registerOnConfigChange();
  registerOnEditorSelectionChange();
  registerOnFileChange();
  registerOnEditorVisibleRangesChange();
}
