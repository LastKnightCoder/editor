import { invoke } from "@/electron";
import { withModule } from "@/commands/module-init";
import { rendererSyncRegistry } from "@/app/plugins/sync-registry";
import type { JsonValue } from "@tau/plugins";
import type { SyncProvider } from "@tau/plugins/sync";
import type { ISyncProvider, IRemoteFileInfo } from "@/types/sync";
import { traceSyncStage } from "@/services/sync-diagnostics";

/** 配置在工厂创建时固定；存储操作在渲染进程执行，宿主只登记任务。 */
export class PluginSyncProvider implements ISyncProvider {
  private session?: Promise<string>;
  private closed = false;
  constructor(
    private readonly id: string,
    private readonly config: JsonValue,
    private readonly traceId?: string
  ) {}
  private trace<T>(stage: string, run: () => Promise<T>): Promise<T> {
    return this.traceId ? traceSyncStage(this.traceId, this.id, stage, run) : run();
  }
  private async call<T>(method: keyof SyncProvider, ...args: unknown[]): Promise<T> {
    if (this.closed) throw new Error("同步任务已结束");
    this.session ??= this.trace("session-open", () =>
      withModule("plugin-local", () =>
        this.trace("session-register", () =>
          invoke<string>("plugin-local:sync-begin", this.id, this.config)
        )
      )
    );
    const session = await this.session;
    if (this.closed) throw new Error("同步任务已结束");
    return this.trace(
      method,
      () => rendererSyncRegistry.execute({ kind: "call", session, method, args }) as Promise<T>
    );
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
      await this.trace("session-close", async () => {
        const id = await this.session?.catch(() => null);
        if (id) await invoke("plugin-local:sync-end", id);
      });
    }
  }
}
