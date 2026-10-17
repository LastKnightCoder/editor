import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type {
  ModelUsageBreakdownQuery,
  ModelUsageBreakdownRow,
  ModelUsageListResult,
  ModelUsageQuery,
  ModelUsageSummary,
  ModelUsageTimeseriesPoint,
  ModelUsageTimeseriesQuery,
  UsageSyncStatus,
} from "@/types/model-usage";
import type { UsageSyncBackend } from "@/services/usageSync";

const invokeModelUsage = <T = any>(channel: string, ...args: any[]): Promise<T> =>
  withModule("model-usage", () => invoke<T>(channel, ...args));

export const getModelUsagePlugins = () =>
  invokeModelUsage<{ id: string; name: string }[]>("model-usage:plugins");

/** 时间范围内的用量汇总（调用数 / token / 费用 / 失败数） */
export async function getModelUsageSummary(
  query: ModelUsageQuery = {}
): Promise<ModelUsageSummary> {
  return invokeModelUsage("model-usage:summary", query);
}

/** 分页明细，按时间倒序 */
export async function listModelUsage(query: ModelUsageQuery = {}): Promise<ModelUsageListResult> {
  return invokeModelUsage("model-usage:list", query);
}

/** 趋势：按小时 / 天分桶、按维度分组 */
export async function getModelUsageTimeseries(
  query: ModelUsageTimeseriesQuery
): Promise<ModelUsageTimeseriesPoint[]> {
  return invokeModelUsage("model-usage:timeseries", query);
}

/* ── 跨设备同步（主进程侧的打包 / 导入 / 记账） ── */

export const usageSyncBackend: UsageSyncBackend = {
  localSegments: () => invokeModelUsage("model-usage:sync-local-segments"),
  exportSegment: month => invokeModelUsage("model-usage:sync-export-segment", { month }),
  importSegment: input => invokeModelUsage("model-usage:sync-import-segment", input),
  imported: () => invokeModelUsage("model-usage:sync-imported"),
  drop: async (deviceId, month) => {
    await invokeModelUsage("model-usage:sync-drop", { deviceId, month });
  },
  setDeviceNames: async names => {
    await invokeModelUsage("model-usage:sync-set-device-names", names);
  },
};

export async function getUsageSyncStatus(): Promise<UsageSyncStatus> {
  return invokeModelUsage("model-usage:sync-status");
}

export async function setUsageSyncResult(result: { ok: boolean; error?: string }): Promise<void> {
  await invokeModelUsage("model-usage:sync-set-result", result);
}

export async function setUsageDeviceName(name: string): Promise<void> {
  await invokeModelUsage("model-usage:sync-set-self-name", { name });
}

/** 排行：按维度聚合，费用倒序 */
export async function getModelUsageBreakdown(
  query: ModelUsageBreakdownQuery
): Promise<ModelUsageBreakdownRow[]> {
  return invokeModelUsage("model-usage:breakdown", query);
}
