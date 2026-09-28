import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { acquireDatabaseSyncLock, isDatabaseSyncLocked } from "@tau/db-schema/sync";
import type BackendWebSocketServer from "../utils/BackendWebSocketServer";
import { RpcMessageType } from "@/types/rpc";

type Direction = "push" | "pull";
interface Dependencies {
  appDir: string;
  acquireSessions(name: string): Promise<() => void>;
  closeDatabase(name: string): void;
  reconnect(
    name: string,
    source: "sync_upload_reconnect" | "sync_download_reconnect"
  ): Promise<void>;
  saveVersion(name: string, version: number): Promise<void>;
}

/** 锁归 CLI 文件锁所有；CLI 退出或崩溃后，桌面恢复数据库连接并释放会话租约。 */
export class CliSyncCoordinator {
  private readonly leases = new Map<
    string,
    {
      name: string;
      direction: Direction;
      path: string;
      release: () => void;
      timer: ReturnType<typeof setInterval>;
      ending?: Promise<void>;
    }
  >();

  constructor(private readonly deps: Dependencies) {}

  async begin(name: string, direction: Direction): Promise<{ token: string }> {
    if (
      !name ||
      /[\\/]/.test(name) ||
      name.startsWith(".") ||
      !["push", "pull"].includes(direction)
    )
      throw new Error("同步参数无效");
    const path = join(this.deps.appDir, `${name.replace(/\.db$/, "")}.db`);
    if (!isDatabaseSyncLocked(path)) throw new Error("CLI 尚未取得同步锁");
    const release = await this.deps.acquireSessions(name);
    try {
      this.deps.closeDatabase(name);
    } catch (error) {
      release();
      throw error;
    }
    const token = randomUUID();
    const timer = setInterval(() => {
      try {
        if (!isDatabaseSyncLocked(path))
          void this.finish(token).catch(error => console.error("[cli-sync] 恢复连接失败", error));
      } catch (error) {
        console.error("[cli-sync] 检查同步锁失败", error);
      }
    }, 1000);
    timer.unref?.();
    this.leases.set(token, { name, direction, path, release, timer });
    return { token };
  }

  async saveVersion(token: string, version: number): Promise<void> {
    const lease = this.leases.get(token);
    if (!lease || lease.ending || !isDatabaseSyncLocked(lease.path))
      throw new Error("同步锁已失效");
    if (!Number.isSafeInteger(version) || version < 0) throw new Error("同步版本号无效");
    await this.deps.saveVersion(lease.name, version);
  }

  async finish(token: string): Promise<void> {
    const lease = this.leases.get(token);
    if (!lease) return;
    if (lease.ending) return lease.ending;
    if (isDatabaseSyncLocked(lease.path)) throw new Error("请先释放 CLI 同步锁");
    const releaseFile = acquireDatabaseSyncLock(lease.path);
    clearInterval(lease.timer);
    lease.ending = (async () => {
      try {
        await this.deps.reconnect(
          lease.name,
          lease.direction === "pull" ? "sync_download_reconnect" : "sync_upload_reconnect"
        );
      } finally {
        try {
          releaseFile();
        } finally {
          lease.release();
          this.leases.delete(token);
        }
      }
    })();
    return lease.ending;
  }
}

export function registerCliSyncHandlers(server: BackendWebSocketServer, deps: Dependencies): void {
  const coordinator = new CliSyncCoordinator(deps);
  for (const method of ["cli-sync:begin", "cli-sync:version", "cli-sync:finish"] as const) {
    server.addMessageHandler(method, async message => {
      const args = message.params as unknown as unknown[];
      let result: unknown = { ok: true };
      if (method === "cli-sync:begin")
        result = await coordinator.begin(String(args[0]), args[1] as Direction);
      else if (method === "cli-sync:version")
        await coordinator.saveVersion(String(args[0]), args[1] as number);
      else await coordinator.finish(String(args[0]));
      return { id: message.id, method, type: RpcMessageType.Response, result, error: null };
    });
  }
}
