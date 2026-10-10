import { invoke } from "@/electron";

export interface PerfSnapshotResult {
  path: string;
}

/**
 * 导出性能快照（主进程 perf-monitor 汇聚的诊断数据）为 JSON 文件，
 * 落盘到 ~/.editor/logs/perf-snapshot-<时间戳>.json；成功后主进程在系统
 * 文件管理器中打开所在文件夹并高亮该文件，同时弹系统通知提示路径。
 */
export async function exportPerfSnapshot(): Promise<PerfSnapshotResult> {
  return invoke<PerfSnapshotResult>("perf-monitor:export-snapshot");
}
