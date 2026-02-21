import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { unescapeString } from "@/utils/regex";

export function registerDeleteUnusedCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.deleteUnused",
    async (e: (vscode.TreeItem & { data: string[] }) | undefined) => {
      let targets: string[] = [];
      if (e === undefined || typeof e.label !== "string" || e.label.trim() === "" || !Array.isArray(e.data) || e.data.length === 0) {
        const unusedEntries = Array.from(mage.langDetail.unusedKeySet);
        if (unusedEntries.length === 0) {
          NotificationManager.showWarning(t("commands.deleteUnused.noUnusedEntry"));
        } else {
          targets =
            (await vscode.window.showQuickPick(unusedEntries, {
              canPickMany: true,
              placeHolder: t("commands.deleteUnused.placeholder")
            })) || [];
        }
      } else {
        targets = e.data;
      }
      if (targets.length === 0) return;
      const confirmDelete = await NotificationManager.showWarning(
        t("command.deleteUnused.modalTitle"),
        { modal: true, detail: t("command.deleteUnused.modalContent", targets.map(item => unescapeString(item)).join(", ")) },
        { title: t("common.confirm") }
      );
      if (confirmDelete?.title === t("common.confirm")) {
        mage.setOptions({ task: "trim", trimKeyList: targets });
        const res = await mage.execute();
        if (res.success) {
          mage.setOptions({ task: "check" });
          await mage.execute();
          treeInstance.refresh();
        }
        res.defaultSuccessMessage = t("command.deleteUnused.success");
        NotificationManager.showResult(res);
      }
    }
  );

  registerDisposable(disposable);
}
