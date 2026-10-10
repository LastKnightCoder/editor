import { invoke } from "@/electron";

export interface PerfSnapshotResult {
  path: string;
}

/**
 * 导出性能快照（主进程 perf-monitor 汇聚的诊断数据）为 JSON 文件，
 * 落盘到 ~/.editor/logs/perf-snapshot-<时间戳>.json；路径经系统通知提示。
 */
export async function exportPerfSnapshot(): Promise<PerfSnapshotResult> {
  return invoke<PerfSnapshotResult>("perf-monitor:export-snapshot");
}
