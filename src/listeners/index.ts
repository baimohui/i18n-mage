import { registerOnFileSave } from "./onFileSave";
import { registerOnActiveEditorChange } from "./onActiveEditorChange";
import { registerOnConfigChange } from "./onConfigChange";
import { registerOnEditorSelectionChange } from "./onEditorSelectionChange";
import { registerOnFileChange } from "./onFileChange";

export function registerAllListeners() {
  registerOnFileSave();
  registerOnActiveEditorChange();
  registerOnConfigChange();
  registerOnEditorSelectionChange();
  registerOnFileChange();
}
