import * as vscode from "vscode";
import { getValueByAmbiguousEntryName } from "@/utils/regex";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { isPathInsideDirectory, isSamePath, toRelativePath } from "@/utils/fs";

type CopyEntriesTargetArg = vscode.Uri | { key?: string; meta?: { lang?: string }; stack?: string[]; data?: string[] } | undefined;

async function isDirectoryUri(uri: vscode.Uri) {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return (stat.type & vscode.FileType.Directory) !== 0;
  } catch {
    return false;
  }
}

export function registerCopyEntriesCommand() {
  const mage = LangMage.getInstance();
  const getEntriesFromCurrentFile = () => {
    const { dictionary, tree } = mage.langDetail;
    return treeInstance.definedEntriesInCurrentFile.reduce(
      (acc, item) => {
        const key = getValueByAmbiguousEntryName(tree, item.nameInfo.name) as string;
        if (Object.hasOwn(dictionary, key)) {
          acc[key] = dictionary[key].value;
        }
        return acc;
      },
      {} as Record<string, Record<string, string>>
    );
  };

  const getEntriesByUri = async (uri: vscode.Uri) => {
    const { dictionary, used, tree } = mage.langDetail;
    const directory = await isDirectoryUri(uri);
    const selectedFsPath = uri.fsPath;

    const matchedEntryNames = Object.entries(used).reduce((acc, [entryName, filePosMap]) => {
      const hasMatchedFile = Object.keys(filePosMap).some(filePath =>
        directory ? isPathInsideDirectory(selectedFsPath, filePath) : isSamePath(selectedFsPath, filePath)
      );
      if (hasMatchedFile) {
        acc.push(entryName);
      }
      return acc;
    }, [] as string[]);

    const target = matchedEntryNames.reduce(
      (acc, entryName) => {
        const key = getValueByAmbiguousEntryName(tree, entryName);
        if (typeof key === "string" && Object.hasOwn(dictionary, key)) {
          acc[key] = dictionary[key].value;
        }
        return acc;
      },
      {} as Record<string, Record<string, string>>
    );

    if (Object.keys(target).length === 0) {
      NotificationManager.showWarning(t("command.copyEntries.noEntriesInTarget", toRelativePath(uri.fsPath) || uri.fsPath));
      return null;
    }
    return target;
  };

  const disposable = vscode.commands.registerCommand("i18nMage.copyEntries", async (e: CopyEntriesTargetArg) => {
    const { dictionary } = mage.langDetail;
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
    } else if (!(e instanceof vscode.Uri) && typeof e === "object" && Array.isArray(e.data) && e.data.length > 0) {
      target = e.data.reduce(
        (acc, key) => {
          if (Object.hasOwn(dictionary, key)) {
            acc[key] = dictionary[key].value;
          }
          return acc;
        },
        {} as Record<string, Record<string, string>>
      );
    } else if (e instanceof vscode.Uri) {
      target = await getEntriesByUri(e);
    } else {
      target = getEntriesFromCurrentFile();
    }
    if (target === null || Object.keys(target).length === 0) return;
    const content = JSON.stringify(target, null, 2);
    await vscode.env.clipboard.writeText(content);
    NotificationManager.showSuccess(t(`command.copyEntries.success`, Object.keys(target).length));
  });

  registerDisposable(disposable);
}
