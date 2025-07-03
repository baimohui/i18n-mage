import * as vscode from "vscode";
import { t } from "@/utils/i18n";
import { ExecutionContext } from "./context";
import { NotificationManager } from "@/utils/notification";

let isProcessing = false;
const PREFIX = "i18n Mage 🪄 ";

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
  if (isProcessing) {
    NotificationManager.showWarning(t("common.progress.processing"));
    return;
  }
  isProcessing = true;
  const abortController = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    // 设置超时
    const timeout = options.timeout ?? 120000;
    timeoutId = setTimeout(() => {
      abortController.abort();
      NotificationManager.showError(t("common.progress.timeout", timeout));
    }, timeout);
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: options.title ? `${PREFIX}${options.title}` : "",
        cancellable: options.cancellable ?? false
      },
      async (progress, token) => {
        // 创建合并的取消令牌
        const combinedTokenSource = new vscode.CancellationTokenSource();
        // 监听原始 token 的取消
        token.onCancellationRequested(() => {
          combinedTokenSource.cancel();
          NotificationManager.showSuccess(t("common.progress.cancelledByUser"));
        });
        // 监听超时取消
        abortController.signal.addEventListener("abort", () => {
          combinedTokenSource.cancel();
          NotificationManager.showSuccess(t("common.progress.cancelledByTimeout"));
        });
        const combinedToken = combinedTokenSource.token;
        // 绑定合并后的 Token 和 Progress
        ExecutionContext.bind(progress, combinedTokenSource.token);
        try {
          await callback(options.reportProgress === true ? progress : { report: () => {} }, combinedToken);
          if (combinedToken.isCancellationRequested) {
            return; // 操作已被取消，不需要抛出错误
          }
          if (options.reportProgress === true) {
            progress.report({ message: t("common.progress.completed"), increment: 100 });
          }
        } catch (error) {
          if (!combinedToken.isCancellationRequested) {
            const errorMessage = error instanceof Error ? error.message : String(error);
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
  }
}
