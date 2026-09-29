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
} from "@/types/model-usage";

const invokeModelUsage = <T = any>(channel: string, ...args: any[]): Promise<T> =>
  withModule("model-usage", () => invoke<T>(channel, ...args));

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

/** 排行：按维度聚合，费用倒序 */
export async function getModelUsageBreakdown(
  query: ModelUsageBreakdownQuery
): Promise<ModelUsageBreakdownRow[]> {
  return invokeModelUsage("model-usage:breakdown", query);
}
