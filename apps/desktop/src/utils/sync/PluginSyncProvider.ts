import { invoke } from "@/electron";
import { withModule } from "@/commands/module-init";
import type { JsonValue } from "@tau/plugins";
import type { SyncProvider } from "@tau/plugins/sync";
import type { ISyncProvider, IRemoteFileInfo } from "@/types/sync";

/** 配置在工厂创建时固定；后台会话覆盖一轮宿主同步。 */
export class PluginSyncProvider implements ISyncProvider {
  private session?: Promise<string>;
  private closed = false;
  constructor(
    private readonly id: string,
    private readonly config: JsonValue
  ) {}
  private async call<T>(method: keyof SyncProvider, ...args: unknown[]): Promise<T> {
    if (this.closed) throw new Error("同步任务已结束");
    this.session ??= withModule("plugin-local", () =>
      invoke<string>("plugin-local:sync-begin", this.id, this.config)
    );
    const session = await this.session;
    if (this.closed) throw new Error("同步任务已结束");
    return invoke<T>("plugin-local:sync-call", session, method, args);
  }
  uploadFile(name: string, content: Uint8Array) {
    return this.call<boolean>("uploadFile", name, content);
  }
  createFileIfAbsent(name: string, content: Uint8Array) {
    return this.call<boolean>("createFileIfAbsent", name, content);
  }
  downloadFile(name: string) {
    return this.call<Uint8Array>("downloadFile", name);
  }
  fileExists(name: string) {
    return this.call<boolean>("fileExists", name);
  }
  listFiles(prefix?: string) {
    return this.call<IRemoteFileInfo[]>("listFiles", prefix);
  }
  getProviderName() {
    return this.id;
  }
  async deleteFile() {
    return false;
  }
  async dispose() {
    this.closed = true;
    if (this.session) {
      const id = await this.session.catch(() => null);
      if (id) await invoke("plugin-local:sync-end", id);
    }
  }
}
