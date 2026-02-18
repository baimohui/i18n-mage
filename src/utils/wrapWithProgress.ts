import * as vscode from "vscode";
import { t } from "@/utils/i18n";
import { ExecutionContext } from "./context";
import { NotificationManager } from "@/utils/notification";

let isProcessing = false;

interface ProgressOptions {
  title: string;
  cancellable?: boolean;
  reportProgress?: boolean;
  timeout?: number; // in milliseconds
}

export async function wrapWithProgress(
  options: ProgressOptions,
  callback: (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => Promise<void>
): Promise<void> {
  const timeout = options.timeout ?? 1000 * 60 * 3;
  const startedAt = Date.now();
  NotificationManager.logDebug(
    `Progress started: title="${options.title}", cancellable=${Boolean(options.cancellable)}, reportProgress=${Boolean(
      options.reportProgress
    )}, timeout=${timeout}ms`
  );

  if (isProcessing) {
    NotificationManager.setStatusBarMessage(t("common.progress.processing"), 2000);
    NotificationManager.logDebug("Progress skipped because another task is already running");
    return;
  }

  isProcessing = true;
  const abortController = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    timeoutId = setTimeout(() => {
      abortController.abort();
      NotificationManager.logDebug(`Progress aborted by timeout after ${timeout}ms`);
      NotificationManager.showError(t("common.progress.timeout", timeout));
    }, timeout);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: options.title,
        cancellable: options.cancellable ?? false
      },
      async (progress, token) => {
        const combinedTokenSource = new vscode.CancellationTokenSource();

        token.onCancellationRequested(() => {
          combinedTokenSource.cancel();
          NotificationManager.logDebug("Progress cancelled by user");
          NotificationManager.showSuccess(t("common.progress.cancelledByUser"));
        });

        abortController.signal.addEventListener("abort", () => {
          combinedTokenSource.cancel();
          NotificationManager.logDebug("Progress cancellation propagated from timeout signal");
          NotificationManager.showSuccess(t("common.progress.cancelledByTimeout"));
        });

        const combinedToken = combinedTokenSource.token;
        ExecutionContext.bind(progress, combinedToken);

        try {
          const res = await callback(options.reportProgress === true ? progress : { report: () => undefined }, combinedToken);

          if (combinedToken.isCancellationRequested) {
            NotificationManager.logDebug("Progress finished early due to cancellation");
            return;
          }

          if (options.reportProgress === true) {
            progress.report({ message: t("common.progress.completed"), increment: 100 });
          }

          return res;
        } catch (error) {
          if (!combinedToken.isCancellationRequested) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            NotificationManager.logDebug(`Progress failed: ${errorMessage}`);
            NotificationManager.showError(t("common.progress.error", errorMessage));
          }
          throw error;
        } finally {
          ExecutionContext.unbind();
          combinedTokenSource.dispose();
        }
      }
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    isProcessing = false;
    NotificationManager.logDebug(`Progress ended in ${Date.now() - startedAt}ms: title="${options.title}"`);
  }
}
