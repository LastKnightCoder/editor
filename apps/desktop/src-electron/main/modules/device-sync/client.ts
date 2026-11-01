import { DeviceSyncEngine, synchronizeDevice } from "@tau/collaboration/src/device-sync/engine";
import type { DeviceReply } from "@tau/collaboration/src/device-sync/protocol";
import { DEVICE_SYNC_CHUNK_BYTES } from "@tau/collaboration/src/device-sync/protocol";
import { DeviceAssetStore } from "./asset-store";
import { requestDevice, type DevicePeer } from "./transport";

export interface DeviceClientStatus {
  phase: "idle" | "syncing" | "synced" | "offline" | "error";
  lastSync?: number;
  error?: string;
  pendingAssets: number;
}
interface ClientHost {
  engine: DeviceSyncEngine;
  assets: DeviceAssetStore;
  prepare(): Promise<void>;
  assetNames(): string[];
  changed(reply: DeviceReply): void;
  replace(reply: DeviceReply): Promise<void>;
  assertActive(): void;
}
export class DeviceSyncClient {
  readonly status: DeviceClientStatus = { phase: "idle", pendingAssets: 0 };
  private stopped = false;
  private version = 0;
  private executingVersion = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private failures = 0;
  private checkedAssets = new Map<string, number>();
  constructor(
    readonly peer: DevicePeer,
    private readonly host: ClientHost
  ) {}
  assertActive = () => {
    if (this.stopped) throw new Error("DEVICE_SYNC_CLOSED: 设备连接已停止");
    if (this.executingVersion !== this.version)
      throw new Error("DEVICE_SYNC_REPLACED: 原同步任务已失效");
    this.host.assertActive();
  };
  private request<T>(body: unknown) {
    this.assertActive();
    return requestDevice<T>(this.peer, body, this.peer.token, this.controller.signal);
  }
  private serial<T>(operation: () => Promise<T>, replacesConnection = false): Promise<T> {
    const version = this.version;
    const task = this.tail
      .catch(() => undefined)
      .then(async () => {
        if (version !== this.version) throw new Error("DEVICE_SYNC_REPLACED: 原排队任务已失效");
        this.executingVersion = version;
        this.assertActive();
        this.status.phase = "syncing";
        this.status.error = undefined;
        try {
          const result = await operation();
          if (!replacesConnection) this.assertActive();
          this.status.phase = "synced";
          this.status.lastSync = Date.now();
          this.failures = 0;
          return result;
        } catch (error) {
          this.status.phase = String(error).includes("OFFLINE") ? "offline" : "error";
          this.status.error = String(error);
          this.failures++;
          throw error;
        }
      });
    this.tail = task;
    return task;
  }
  async synchronize() {
    return this.serial(async () => {
      await this.host.prepare();
      this.assertActive();
      const reply = await synchronizeDevice(this.host.engine, offer =>
        this.request<DeviceReply>({ kind: "sync", offer })
      );
      this.assertActive();
      this.host.changed(reply);
      await this.synchronizeAssets();
      return reply;
    });
  }
  async download() {
    clearTimeout(this.timer);
    this.version++;
    this.controller.abort();
    this.controller = new AbortController();
    const version = this.version;
    return this.serial(async () => {
      const reply = await this.request<DeviceReply>({ kind: "download" });
      this.assertActive();
      await this.host.replace(reply);
      if (!this.stopped) {
        this.host.changed(reply);
        await this.synchronizeAssets();
      }
    }, true).finally(() => {
      if (!this.stopped && this.version === version) this.schedule(this.retryDelay());
    });
  }
  private async synchronizeAssets() {
    let pending = 0;
    for (const name of this.host.assetNames()) {
      this.assertActive();
      if (Date.now() - (this.checkedAssets.get(name) ?? 0) < 60_000) continue;
      try {
        const local = this.host.assets.has(name);
        const remote = await this.request<{ exists: boolean }>({ kind: "asset-has", name });
        if (local !== remote.exists) {
          for (let offset = 0; ; offset += DEVICE_SYNC_CHUNK_BYTES) {
            const chunk = local
              ? this.host.assets.read(name, offset)
              : await this.request<{ size: number; bytes: string; sha256: string }>({
                  kind: "asset-read",
                  name,
                  offset,
                });
            this.assertActive();
            if (local) await this.request({ kind: "asset-write", name, offset, ...chunk });
            else this.host.assets.write(name, offset, chunk.size, chunk.bytes, chunk.sha256);
            if (offset + DEVICE_SYNC_CHUNK_BYTES >= chunk.size) break;
          }
        } else if (!local) {
          pending++;
          continue;
        }
        this.checkedAssets.set(name, Date.now());
      } catch {
        this.assertActive();
        pending++;
      }
    }
    this.status.pendingAssets = pending;
  }
  start() {
    this.schedule(0);
  }
  wake() {
    this.checkedAssets.clear();
    this.schedule(0);
  }
  private retryDelay() {
    return this.failures ? Math.min(60_000, 2000 * 2 ** Math.min(this.failures - 1, 5)) : 1000;
  }
  private schedule(delay: number) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.synchronize()
        .catch(() => undefined)
        .finally(() => {
          this.schedule(this.retryDelay());
        });
    }, delay);
    this.timer.unref();
  }
  stop() {
    this.stopped = true;
    this.version++;
    clearTimeout(this.timer);
    this.controller.abort();
  }
}
