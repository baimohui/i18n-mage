import * as vscode from "vscode";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import previewFixContent from "@/views/fixWebview";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { getConfig } from "@/utils/config";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { EXECUTION_RESULT_CODE } from "@/types";

type EntryCommandPayload = { name: string; key: string; description: string; meta: { lang?: string } };

export function registerRetranslateEntryCommand(context: vscode.ExtensionContext) {
  const mage = LangMage.getInstance();
  const disposable = vscode.commands.registerCommand("i18nMage.retranslateEntry", async (e?: EntryCommandPayload) => {
    const dictionary = mage.langDetail.dictionary;
    const publicCtx = mage.getPublicContext();
    const referredLang = publicCtx.referredLang;
    const availableLangs = mage.detectedLangList.filter(lang => !publicCtx.ignoredLangs.includes(lang) && lang !== referredLang);

    let key: string | undefined = e?.key;
    let targetLang: string | undefined = undefined;

    if (key === undefined) {
      key = await vscode.window.showQuickPick(Object.keys(dictionary), {
        canPickMany: false,
        placeHolder: t("command.retranslateEntry.selectEntryToRetranslate"),
        ignoreFocusOut: true
      });
      if (key === undefined) return;
    }

    if (e?.meta?.lang !== undefined && e.meta.lang !== referredLang) {
      targetLang = e.meta.lang;
    } else {
      if (availableLangs.length === 0) {
        NotificationManager.showWarning(t("command.retranslateEntry.noTargetLang"));
        return;
      }
      targetLang = await vscode.window.showQuickPick(availableLangs, {
        canPickMany: false,
        placeHolder: t("command.retranslateEntry.selectTargetLanguage"),
        ignoreFocusOut: true
      });
    }

    if (targetLang === undefined) return;
    if (targetLang === referredLang) {
      NotificationManager.showWarning(t("command.retranslateEntry.invalidTargetLang"));
      return;
    }

    const sourceValue = dictionary?.[key]?.value?.[referredLang] ?? "";
    if (sourceValue.trim().length === 0) {
      NotificationManager.showWarning(t("command.retranslateEntry.noSourceValue", referredLang));
      return;
    }

    const previousTargetValue = dictionary?.[key]?.value?.[targetLang] ?? "";
    NotificationManager.showTitle(t("command.retranslateEntry.retranslateEntry"));

    await wrapWithProgress(
      { title: t("command.retranslateEntry.retranslating"), cancellable: true, timeout: 1000 * 60 * 10 },
      async (_, token) => {
        if (token.isCancellationRequested) return;

        mage.setOptions({
          task: "modify",
          modifyQuery: {
            type: "retranslateEntry",
            key,
            sourceLang: referredLang,
            targetLang
          }
        });
        const res = await mage.execute();

        if (token.isCancellationRequested || res.code === EXECUTION_RESULT_CODE.Cancelled) {
          mage.setPendingChanges([], {});
          return;
        }
        if (!res.success) {
          NotificationManager.showResult(res);
          mage.setPendingChanges([], {});
          return;
        }

        const updatedValue = mage.langDetail.updatePayloads[0]?.valueChanges?.[targetLang]?.after;
        if (typeof updatedValue === "string" && updatedValue === previousTargetValue) {
          NotificationManager.showSuccess(t("command.retranslateEntry.sameValue"));
          mage.setPendingChanges([], {});
          return;
        }

        const applyRewrite = async () => {
          await wrapWithProgress({ title: t("command.rewrite.progress") }, async () => {
            await mage.execute({ task: "rewrite" });
            if (e && typeof updatedValue === "string") {
              e.description = updatedValue;
            }
            if (previousTargetValue.length === 0) {
              await mage.execute({ task: "check", globalFlag: false });
              mage.setOptions({ globalFlag: true });
            } else {
              await mage.execute({ task: "check" });
            }
            treeInstance.refresh();
            NotificationManager.showResult(res);
          });
        };

        if (getConfig<boolean>("general.previewChanges", true)) {
          previewFixContent(
            context,
            mage.langDetail.updatePayloads,
            {},
            mage.langDetail.countryMap,
            referredLang,
            async () => {
              await applyRewrite();
            },
            async () => {
              mage.setPendingChanges([], {});
              await mage.execute({ task: "check" });
              treeInstance.refresh();
            }
          );
        } else {
          await applyRewrite();
        }
      }
    );
  });

  registerDisposable(disposable);
}
