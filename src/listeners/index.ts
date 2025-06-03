import { registerOnFileSave } from "./onFileSave";
import { registerOnActiveEditorChange } from "./onActiveEditorChange";
import { registerOnConfigChange } from "./onConfigChange";
import { registerOnEditorSelectionChange } from "./onEditorSelectionChange";

export function registerAllListeners() {
  registerOnFileSave();
  registerOnActiveEditorChange();
  registerOnConfigChange();
  registerOnEditorSelectionChange();
}
