import * as vscode from "vscode";
import { getValueByAmbiguousEntryName } from "@/utils/regex";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";

export function registerCopyEntriesCommand() {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand(
    "i18nMage.copyEntries",
    async (e: vscode.Uri | { key?: string; meta?: { lang?: string }; stack?: string[] } | undefined) => {
      const { dictionary, tree } = mage.langDetail;
      let target: Record<string, Record<string, string>> | null = null;
      if (e === undefined) {
        const keys = await vscode.window.showQuickPick(Object.keys(dictionary), {
          canPickMany: true,
          placeHolder: t("command.copyEntries.selectEntry")
        });
        if (keys === undefined || keys.length === 0) return;
        target = keys.reduce(
          (acc, key) => {
            acc[key] = dictionary[key].value;
            return acc;
          },
          {} as Record<string, Record<string, string>>
        );
      } else if (!(e instanceof vscode.Uri) && typeof e === "object" && e.key !== undefined) {
        const { key, meta } = e;
        if (meta && meta.lang !== undefined) {
          target = {
            [key]: { [meta.lang]: dictionary[key].value[meta.lang] }
          };
        } else {
          target = {
            [key]: dictionary[key].value
          };
        }
      } else if (!(e instanceof vscode.Uri) && typeof e === "object" && e.stack !== undefined) {
        const keyPrefix = e.stack.join(".");
        target = Object.fromEntries(
          Object.entries(dictionary)
            .filter(([key]) => key.startsWith(keyPrefix))
            .map(([key, value]) => [key, value.value])
        );
      } else {
        target = treeInstance.definedEntriesInCurrentFile.reduce(
          (acc, item) => {
            const key = getValueByAmbiguousEntryName(tree, item.nameInfo.name) as string;
            acc[key] = dictionary[key].value;
            return acc;
          },
          {} as Record<string, Record<string, string>>
        );
      }
      const content = JSON.stringify(target, null, 2);
      await vscode.env.clipboard.writeText(content);
      NotificationManager.showSuccess(t(`command.copyEntries.success`, Object.keys(target).length));
    }
  );

  registerDisposable(disposable);
}
