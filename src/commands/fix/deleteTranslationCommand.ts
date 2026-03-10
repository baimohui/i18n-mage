import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { unescapeString } from "@/utils/regex";

export function registerDeleteTranslationCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.deleteTranslation",
    async (e?: { key?: string; data?: string[]; meta?: { lang?: string } }) => {
      const lang = e?.meta?.lang ?? e?.key;
      const dataList = Array.isArray(e?.data) ? e.data : [];
      const key = typeof e?.key === "string" && !Array.isArray(e?.data) ? e.key : undefined;
      const targets = key !== undefined ? [key] : dataList;
      if (typeof lang !== "string" || lang.trim().length === 0 || targets.length === 0) {
        NotificationManager.showWarning(t("command.deleteTranslation.invalidTarget"));
        return;
      }
      const confirmDelete =
        targets.length === 1
          ? await NotificationManager.showWarning(
              t("command.deleteTranslation.modalTitle"),
              { modal: true, detail: t("command.deleteTranslation.modalContent", unescapeString(targets[0]), lang) },
              { title: t("common.confirm") }
            )
          : await NotificationManager.showWarning(
              t("command.deleteTranslation.modalTitle"),
              {
                modal: true,
                detail: t(
                  "command.deleteTranslation.modalContentMany",
                  String(targets.length),
                  lang,
                  targets
                    .slice(0, 50)
                    .map(item => unescapeString(item))
                    .join(", ")
                )
              },
              { title: t("common.confirm") }
            );
      if (confirmDelete?.title !== t("common.confirm")) return;
      mage.setOptions({ task: "modify", modifyQuery: { type: "deleteValue", data: targets.map(k => ({ key: k, lang })) } });
      const res = await mage.execute();
      if (res.success) {
        mage.setOptions({ task: "check" });
        await mage.execute();
        treeInstance.refresh();
      }
      res.defaultSuccessMessage =
        targets.length === 1
          ? t("command.deleteTranslation.success", unescapeString(targets[0]), lang)
          : t("command.deleteTranslation.successMany", String(targets.length), lang);
      NotificationManager.showResult(res);
    }
  );

  registerDisposable(disposable);
}
