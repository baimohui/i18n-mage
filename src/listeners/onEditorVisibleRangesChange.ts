import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { DecoratorController } from "@/features/Decorator";
import { debounce } from "@/utils/common";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { getCacheConfig } from "@/utils/config";

export function registerOnEditorVisibleRangesChange() {
  const decorator = DecoratorController.getInstance();
  const refresh = (event: vscode.TextEditorVisibleRangesChangeEvent) => {
    ActiveEditorState.updateVisibleEntries(event.textEditor);
    decorator.handleVisibleRangesChange(event);
  };
  const debouncedHandler = debounce(refresh, 200);
  const disposable = vscode.window.onDidChangeTextEditorVisibleRanges(event => {
    const realtime = getCacheConfig<boolean>("translationHints.realtimeVisibleRangeUpdate", false);
    if (realtime) {
      refresh(event);
      return;
    }
    void debouncedHandler(event);
  });
  registerDisposable(decorator);
  registerDisposable(disposable);
}
