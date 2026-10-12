/**
 * 性能计时的记录侧（electron-free）：IPC / SQL / 同步 IO 慢调用明细 + IPC 速率聚合。
 * 数据只存模块级 ring buffer（约最近 1 小时），由 perf-monitor 的周期采样与快照导出消费。
 *
 * 拆出独立文件的原因：接入方（command-bridge-install、database、pi-session-files 等）
 * 中有刻意保持 electron-free 以便单测的模块，不能反向依赖含 electron 的 perf-monitor。
 * recordIpcCall / recordSqlCall 在主入口首个 import 期即被调用，状态必须挂在模块级。
 */

export interface Timestamped {
  t: number;
}

export interface IpcCallSample extends Timestamped {
  channel: string;
  ms: number;
  ok: boolean;
  // 仅慢调用附带的结果序列化字节数：区分「单值大」与「条目多」两种结构化克隆压力
  resultBytes?: number;
}

export interface SqlCallSample extends Timestamped {
  db: string;
  event: string;
  ms: number;
  ok: boolean;
}

export interface SyncIoSample extends Timestamped {
  label: string;
  bytes: number;
  ms: number;
}

export interface IpcRateSample extends Timestamped {
  callsPerMin: number;
  topChannels: Array<{ channel: string; count: number }>;
}

// 阈值与容量按「导出时刻回看最近一小时」取舍：明细只记异常，趋势类低频全记
const SLOW_IPC_MS = 100;
const SLOW_SQL_MS = 50;
const SLOW_SYNC_IO_MS = 50;
const RING_CAP = 600;

export function pushCapped<T>(buffer: T[], item: T): void {
  buffer.push(item);
  if (buffer.length > RING_CAP) {
    buffer.splice(0, buffer.length - RING_CAP);
  }
}

export const slowIpc: IpcCallSample[] = [];
export const ipcRateSamples: IpcRateSample[] = [];
export const slowSql: SqlCallSample[] = [];
export const slowSyncIo: SyncIoSample[] = [];
export const stages: Array<Timestamped & { label: string; ms: number; count?: number }> = [];

export function recordStage(label: string, ms: number, count?: number) {
  pushCapped(stages, { t: Date.now(), label, ms, count });
}

const ipcRateByMinute = new Map<number, Map<string, number>>();

function bucketOf(timeMs: number): number {
  return Math.floor(timeMs / 60_000);
}

/** 每分钟聚合一次 IPC 调用速率（洪水检测：比单次慢调用更常见的卡因） */
export function flushIpcRate(): void {
  const currentBucket = bucketOf(Date.now());
  for (const [bucket, byChannel] of ipcRateByMinute) {
    if (bucket >= currentBucket) continue;
    let total = 0;
    for (const count of byChannel.values()) total += count;
    const topChannels = [...byChannel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([channel, count]) => ({ channel, count }));
    pushCapped(ipcRateSamples, { t: bucket * 60_000, callsPerMin: total, topChannels });
    ipcRateByMinute.delete(bucket);
  }
}

// 慢调用才估算结果大小：JSON.stringify 是 O(n) 开销，不能给每个 IPC 都付
function estimateResultBytes(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.length;
  if (value instanceof Uint8Array) return value.byteLength;
  try {
    return JSON.stringify(value)?.length;
  } catch {
    return undefined;
  }
}

export function recordIpcCall(channel: string, ms: number, ok: boolean, result?: unknown): void {
  const now = Date.now();
  if (ms >= SLOW_IPC_MS) {
    pushCapped(slowIpc, {
      t: now,
      channel,
      ms,
      ok,
      resultBytes: result !== undefined ? estimateResultBytes(result) : undefined,
    });
  }
  const bucket = bucketOf(now);
  let byChannel = ipcRateByMinute.get(bucket);
  if (!byChannel) {
    byChannel = new Map();
    ipcRateByMinute.set(bucket, byChannel);
  }
  byChannel.set(channel, (byChannel.get(channel) ?? 0) + 1);
}

export function recordSqlCall(db: string, event: string, ms: number, ok: boolean): void {
  if (ms >= SLOW_SQL_MS) {
    pushCapped(slowSql, { t: Date.now(), db, event, ms, ok });
  }
}

/** 同步 IO 计时记录：主进程秒级阻塞的头号嫌疑路径，超阈值落 ring buffer */
export function recordSyncIo(label: string, bytes: number, ms: number): void {
  if (ms >= SLOW_SYNC_IO_MS) {
    pushCapped(slowSyncIo, { t: Date.now(), label: label.slice(0, 200), bytes, ms });
  }
}
