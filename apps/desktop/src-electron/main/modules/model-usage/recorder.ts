import log from "electron-log";
import type { ModelUsageEvent } from "@/types/model-usage";
import type { ModelUsageStore } from "./store";
import { ulid } from "./ulid";

/** 采集点交给 recorder 的字段；eventId / deviceId / 服务商名 / 缺省库由 recorder 补齐 */
export type UsageRecordInput = Omit<
  ModelUsageEvent,
  "eventId" | "deviceId" | "providerName" | "library"
> & { library?: string | null };

export interface UsageRecorderDeps {
  getStore: () => ModelUsageStore | null;
  getDeviceId: () => string;
  /** 当前激活知识库（采集点没带 library 时用） */
  getDefaultLibrary: () => string | null;
  getProviderName: (providerId: string) => string | null;
  flushIntervalMs?: number;
  batchSize?: number;
  /** 库不可用时最多缓存的条数，超出丢最旧的，避免内存无限增长 */
  maxBuffered?: number;
}

export const normalizeLibrary = (name: string | null | undefined): string | null => {
  const trimmed = name?.trim();
  return trimmed ? trimmed.replace(/\.db$/, "") : null;
};

/**
 * 用量事件缓冲写入：攒批后单事务落库，写失败只打日志——审计不能拖垮模型调用本身。
 */
export class UsageRecorder {
  private buffer: ModelUsageEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxBuffered: number;

  constructor(private readonly deps: UsageRecorderDeps) {
    this.flushIntervalMs = deps.flushIntervalMs ?? 1000;
    this.batchSize = deps.batchSize ?? 50;
    this.maxBuffered = deps.maxBuffered ?? 2000;
  }

  record(input: UsageRecordInput): void {
    try {
      const event: ModelUsageEvent = {
        ...input,
        eventId: ulid(input.ts),
        deviceId: this.deps.getDeviceId(),
        library: normalizeLibrary(input.library) ?? normalizeLibrary(this.deps.getDefaultLibrary()),
        providerName: this.deps.getProviderName(input.providerId),
      };
      this.buffer.push(event);
      if (this.buffer.length > this.maxBuffered) {
        this.buffer.splice(0, this.buffer.length - this.maxBuffered);
      }
      if (this.buffer.length >= this.batchSize) {
        this.flush();
      } else {
        this.scheduleFlush();
      }
    } catch (error) {
      log.warn("[ModelUsage] record failed:", error);
    }
  }

  /** 同步写库（better-sqlite3 是同步 API），退出前调用保证不丢 */
  flush(): void {
    this.clearTimer();
    if (this.buffer.length === 0) return;
    const store = this.deps.getStore();
    if (!store) {
      this.scheduleFlush();
      return;
    }
    const batch = this.buffer;
    this.buffer = [];
    try {
      store.insertMany(batch);
    } catch (error) {
      log.warn(`[ModelUsage] flush failed, dropped ${batch.length} events:`, error);
    }
  }

  get pendingCount(): number {
    return this.buffer.length;
  }

  dispose(): void {
    this.flush();
    this.clearTimer();
  }

  private scheduleFlush() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.flushIntervalMs);
    this.timer.unref?.();
  }

  private clearTimer() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
