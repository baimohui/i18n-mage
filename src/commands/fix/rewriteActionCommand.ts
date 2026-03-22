import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";

type EntryCommandPayload = { name: string; key: string; description: string; meta: { lang?: string } };

export function registerRewriteActionCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.rewriteAction", async (e?: EntryCommandPayload) => {
    const publicCtx = mage.getPublicContext();
    const referredLang = publicCtx.referredLang;
    let lang = e?.meta?.lang;
    if (lang === undefined) {
      const availableLangs = mage.detectedLangList.filter(item => !publicCtx.ignoredLangs.includes(item));
      if (availableLangs.length === 0) {
        NotificationManager.showWarning(t("command.retranslateEntry.noTargetLang"));
        return;
      }
      lang = await vscode.window.showQuickPick(availableLangs, {
        canPickMany: false,
        placeHolder: t("command.retranslateEntry.selectTargetLanguage"),
        ignoreFocusOut: true
      });
      if (lang === undefined) return;
      if (e) {
        e.meta.lang = lang;
      } else {
        e = { name: "", key: "", description: "", meta: { lang } };
      }
    }

    const isSourceLang = lang === referredLang;
    if (isSourceLang) {
      await vscode.commands.executeCommand("i18nMage.rewriteEntry", e);
      return;
    }

    const picked = await vscode.window.showQuickPick(
      [
        { label: t("command.retranslateEntry.retranslateEntry"), value: "retranslate" },
        { label: t("command.rewriteEntry.rewriteEntry"), value: "rewrite" }
      ],
      {
        canPickMany: false,
        placeHolder: t("command.rewriteEntry.selectAction"),
        ignoreFocusOut: true
      }
    );
    if (!picked) return;

    if (picked.value === "rewrite") {
      await vscode.commands.executeCommand("i18nMage.rewriteEntry", e);
      return;
    }
    await vscode.commands.executeCommand("i18nMage.retranslateEntry", e);
  });

  registerDisposable(disposable);
}
