import path from "node:path";
import { openSyncPlugin } from "@tau/plugins/sync-host";
import type { JsonValue, SyncProvider } from "@tau/plugins/sync";
import { getAppDir } from "../path.js";
import type { ISyncProvider } from "./types.js";
import { acquirePluginSyncLease } from "@tau/plugins/sync-leases";

declare const __TAU_CLIENT_VERSION__: string;

/** 每轮任务固定配置并加载同一份已安装后台，独立于桌面窗口。 */
export class PluginSyncProvider implements ISyncProvider {
  private provider?: Promise<SyncProvider>;
  private release?: () => Promise<void>;
  private closed = false;
  constructor(
    private readonly id: string,
    private readonly config: JsonValue
  ) {}
  private load() {
    if (this.closed) throw new Error("同步任务已结束");
    return (this.provider ??= (async () => {
      const directory = path.join(getAppDir(), "plugins");
      this.release = await acquirePluginSyncLease(directory, this.id);
      try {
        return await openSyncPlugin({
          directory: path.join(getAppDir(), "plugins"),
          pluginId: this.id,
          config: this.config,
          clientVersion: __TAU_CLIENT_VERSION__,
        });
      } catch (error) {
        await this.release();
        throw error;
      }
    })());
  }
  async dispose() {
    this.closed = true;
    await this.provider?.catch(() => undefined);
    await this.release?.();
  }
  async uploadFile(name: string, bytes: Uint8Array) {
    return (await this.load()).uploadFile(name, bytes);
  }
  async createFileIfAbsent(name: string, bytes: Uint8Array) {
    return (await this.load()).createFileIfAbsent(name, bytes);
  }
  async downloadFile(name: string) {
    return (await this.load()).downloadFile(name);
  }
  async fileExists(name: string) {
    return (await this.load()).fileExists(name);
  }
  getProviderName() {
    return this.id;
  }
}
