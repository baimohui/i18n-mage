import * as vscode from "vscode";
import { registerDisposable } from "@/utils/dispose";
import { setConfig, getConfig } from "@/utils/config";
import { DecoratorController } from "@/features/Decorator";
import { NotificationManager } from "@/utils/notification";
import { t } from "@/utils/i18n";

export function registerToggleInlineTranslationCommand() {
  const disposable = vscode.commands.registerCommand("i18nMage.toggleInlineTranslation", async () => {
    const enabled = getConfig<boolean>("translationHints.enable");
    await setConfig("translationHints.enable", !enabled);
    NotificationManager.setStatusBarMessage(
      !enabled ? t("config.toggleInlineTranslation.enabled") : t("config.toggleInlineTranslation.disabled")
    );
    const decorator = DecoratorController.getInstance();
    decorator.update(vscode.window.activeTextEditor);
  });

  registerDisposable(disposable);
}
