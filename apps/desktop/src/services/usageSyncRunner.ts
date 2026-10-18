/**
 * 用量同步的触发入口：取当前同步服务商、单飞（同一时刻只跑一轮）、结果记账。
 * 失败只记录不抛——用量同步是附带的，不能影响数据库同步与退出流程。
 */
import { SyncProviderFactory } from "@/utils/sync";
import { setUsageSyncResult, usageSyncBackend } from "@/commands/model-usage";
import { removeUsageDevice, syncUsage, type UsageSyncReport } from "./usageSync";

let running: Promise<UsageSyncReport | null> | null = null;

export function runUsageSync(): Promise<UsageSyncReport | null> {
  running ??= (async () => {
    const provider = SyncProviderFactory.getSyncProvider();
    if (!provider) return null;
    try {
      const report = await syncUsage(provider, usageSyncBackend);
      await setUsageSyncResult(
        report.warnings.length > 0 ? { ok: false, error: report.warnings.join("；") } : { ok: true }
      );
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[UsageSync] 同步失败:", error);
      await setUsageSyncResult({ ok: false, error: message }).catch(() => undefined);
      return null;
    } finally {
      await provider.dispose?.().catch(error => {
        console.error("[UsageSync] 释放同步任务失败:", error);
      });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

export async function removeDeviceFromUsageSync(deviceId: string, selfDeviceId: string) {
  const provider = SyncProviderFactory.getSyncProvider();
  if (!provider) throw new Error("请先在「同步」中配置同步服务");
  try {
    await removeUsageDevice(provider, usageSyncBackend, { deviceId, selfDeviceId });
  } finally {
    await provider.dispose?.();
  }
}
