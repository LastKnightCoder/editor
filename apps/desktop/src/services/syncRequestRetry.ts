import type { ISyncProvider } from "@/types/sync";
import { sleep } from "@/utils/sleep";

const RETRY_DELAYS = [1000, 2000, 4000];

function retryReason(error: unknown): string | null {
  if (error instanceof Error && error.name === "AbortError") return null;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (
    [
      "401",
      "403",
      "invalid",
      "无效",
      "不允许",
      "已结束",
      "未就绪",
      "已失效",
      "已断开",
      "已停用",
      "已取消",
      "cancel",
      "not allowed",
      "认证",
      "凭证",
    ].some(part => message.includes(part))
  )
    return null;
  if (["timeout", "timed out", "超时"].some(part => message.includes(part))) return "timeout";
  if (
    [
      "network",
      "connection",
      "fetch failed",
      "failed to fetch",
      "econnreset",
      "econnrefused",
      "etimedout",
      "网络",
      "断网",
      "长时间没有进展",
    ].some(part => message.includes(part))
  )
    return "network";
  if (["429", "500", "502", "503", "504"].some(part => message.includes(part))) return "server";
  return message === "同步对象上传失败" ? "upload-rejected" : null;
}

async function retryRequest<T>(
  context: { provider: string; operation: string; object: string; bytes: number },
  request: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    const requestStarted = Date.now();
    console.info("[sync-transfer] start", { ...context, attempt: attempt + 1 });
    try {
      const value = await request();
      console.info("[sync-transfer] done", {
        ...context,
        attempt: attempt + 1,
        elapsedMs: Date.now() - requestStarted,
        totalMs: Date.now() - started,
      });
      return value;
    } catch (error) {
      const reason = retryReason(error);
      const delay = reason ? RETRY_DELAYS[attempt] : undefined;
      console.warn("[sync-transfer] failed", {
        ...context,
        attempt: attempt + 1,
        elapsedMs: Date.now() - requestStarted,
        totalMs: Date.now() - started,
        reason: reason ?? "permanent",
        retryMs: delay ?? 0,
      });
      if (delay === undefined) throw error;
      await sleep(delay);
    }
  }
}

/** 仅包装数据库同步的幂等存储请求，资源同步继续使用自己的重试策略。 */
export function withSyncRequestRetry(provider: ISyncProvider): ISyncProvider {
  const call = <T>(operation: string, object: string, bytes: number, request: () => Promise<T>) =>
    retryRequest({ provider: provider.getProviderName(), operation, object, bytes }, request);
  return {
    uploadFile: (name, bytes) =>
      call("uploadFile", name, bytes.length, async () => {
        if (!(await provider.uploadFile(name, bytes))) throw new Error("同步对象上传失败");
        return true;
      }),
    downloadFile: name => call("downloadFile", name, 0, () => provider.downloadFile(name)),
    fileExists: name => call("fileExists", name, 0, () => provider.fileExists(name)),
    listFiles: prefix => call("listFiles", prefix ?? "", 0, () => provider.listFiles(prefix)),
    createFileIfAbsent: (name, bytes) => provider.createFileIfAbsent(name, bytes),
    deleteFile: name => provider.deleteFile(name),
    getProviderName: () => provider.getProviderName(),
    dispose: async () => {
      await provider.dispose?.();
    },
  };
}
