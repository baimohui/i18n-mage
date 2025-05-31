import { registerOnFileSave } from "./onFileSave";
import { registerOnActiveEditorChange } from "./onActiveEditorChange";
import { registerOnConfigChange } from "./onConfigChange";

export function registerAllListeners() {
  registerOnFileSave();
  registerOnActiveEditorChange();
  registerOnConfigChange();
}
