import {
  PluginPermissionError,
  type PluginPermission,
  type PluginPermissionState,
} from "./permissions";
import type { PluginContext } from "./contract";
import type { PermissionsAdapter, PluginOwner } from "./host";

export type PermissionDecision = "once" | "always" | "deny";
export type PermissionGrant = "granted" | "blocked";
export type PermissionSnapshot = Record<string, Partial<Record<PluginPermission, PermissionGrant>>>;
export type PermissionUsage = { read: number; write: number; delete: number };
export interface PermissionPersistence {
  usage?(pluginId: string): Promise<PermissionUsage>;
  recover?(): Promise<void>;
  record?(pluginId: string, counts: PermissionUsage): Promise<void>;
  read(): Promise<PermissionSnapshot>;
  write(
    pluginId: string,
    permission: PluginPermission,
    grant: PermissionGrant | null
  ): Promise<void>;
}
export interface PermissionPrompt {
  id: number;
  plugin: PluginOwner;
  permissions: readonly PluginPermission[];
  decide(decision: PermissionDecision): Promise<void>;
}
interface Session {
  context: PluginContext;
  once: Set<PluginPermission>;
  denied: Set<PluginPermission>;
}
interface Request {
  prompt: PermissionPrompt;
  session: Session;
  resolve(decision: PermissionDecision): void;
  reject(error: unknown): void;
  cleanup(): void;
  deciding: boolean;
}

/** 设备与界面由适配器提供；会话授权不进入持久化快照。 */
export class PluginPermissionBroker implements PermissionsAdapter {
  private stored: PermissionSnapshot = {};
  private usage = new Map<string, PermissionUsage>();
  private usageTimer?: ReturnType<typeof setTimeout>;
  private sessions = new Map<string, Session>();
  private denials = new Map<string, number>();
  private requests: Request[] = [];
  private pending = new Map<string, Set<PluginPermission>>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private nextId = 0;
  private closed = false;
  private writes: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;
  private loadError: unknown;
  get error() {
    return this.loadError;
  }

  constructor(
    private readonly persistence: PermissionPersistence,
    private readonly canPrompt: () => boolean
  ) {
    this.ready = persistence.read().then(snapshot => {
      if (!this.closed) {
        this.stored = snapshot;
        this.publish();
      }
    });
    // 错误保留在 ready，调用者必须处理，不能把读取失败当成没有授权。
    void this.ready.catch(error => {
      if (!this.closed) {
        this.loadError = error;
        this.publish();
      }
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.revision;
  get prompts(): readonly PermissionPrompt[] {
    return this.requests.map(item => item.prompt);
  }
  pendingFor(pluginId: string) {
    return [...(this.pending.get(pluginId) ?? [])];
  }
  private publish() {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  private assert(context?: PluginContext) {
    if (this.closed) throw new Error("插件授权会话已结束");
    context?.signal.throwIfAborted();
  }
  private session(context: PluginContext) {
    this.assert(context);
    let session = this.sessions.get(context.pluginId);
    if (!session || session.context !== context) {
      session = { context, once: new Set(), denied: new Set() };
      this.sessions.set(context.pluginId, session);
      const current = session;
      context.signal.addEventListener(
        "abort",
        () => {
          if (this.sessions.get(context.pluginId) === current) {
            this.sessions.delete(context.pluginId);
            this.pending.delete(context.pluginId);
            this.publish();
          }
        },
        { once: true }
      );
    }
    return session;
  }
  rowState(pluginId: string): Partial<Record<PluginPermission, "always" | "once" | "blocked">> {
    const result: Partial<Record<PluginPermission, "always" | "once" | "blocked">> = {};
    for (const [permission, grant] of Object.entries(this.stored[pluginId] ?? {}))
      result[permission as PluginPermission] = grant === "granted" ? "always" : "blocked";
    const session = this.sessions.get(pluginId);
    if (session && !session.context.signal.aborted)
      for (const permission of session.once) if (!result[permission]) result[permission] = "once";
    return result;
  }
  async query(
    context: PluginContext,
    permission: PluginPermission
  ): Promise<PluginPermissionState> {
    await this.ready;
    const session = this.session(context);
    const state = this.rowState(context.pluginId)[permission];
    if (state === "always" || state === "once") return "granted";
    if (state === "blocked" || session.denied.has(permission)) return "denied";
    return "prompt";
  }
  private async requestDecision(
    context: PluginContext,
    plugin: PluginOwner,
    permissions: readonly PluginPermission[]
  ) {
    await this.ready;
    const session = this.session(context);
    const missing: PluginPermission[] = [];
    for (const permission of new Set(permissions)) {
      const state = await this.query(context, permission);
      if (state === "denied")
        throw new PluginPermissionError(
          permission,
          this.stored[plugin.id]?.[permission] === "blocked" ? "blocked" : "denied"
        );
      if (state !== "granted") missing.push(permission);
    }
    this.assert(context);
    if (!missing.length) return;
    if (!this.canPrompt()) {
      this.pending.set(plugin.id, new Set([...(this.pending.get(plugin.id) ?? []), ...missing]));
      this.publish();
      throw new PluginPermissionError(missing[0], "unavailable");
    }
    const decision = await new Promise<PermissionDecision>((resolve, reject) => {
      const remove = () => {
        this.requests = this.requests.filter(item => item !== request);
        this.publish();
      };
      const abort = () => {
        remove();
        reject(context.signal.reason ?? new Error("插件已停用"));
      };
      const request: Request = {
        session,
        resolve,
        reject,
        deciding: false,
        cleanup: () => context.signal.removeEventListener("abort", abort),
        prompt: {
          id: ++this.nextId,
          plugin,
          permissions: missing,
          decide: async decision => {
            this.assert(context);
            if (this.requests[0] !== request || request.deciding) return;
            request.deciding = true;
            try {
              for (const permission of missing) {
                this.assert(context);
                if (!this.requests.includes(request)) throw new Error("授权请求已取消");
                if (decision === "always") await this.persist(plugin.id, permission, "granted");
                else if (decision === "once") session.once.add(permission);
                else {
                  session.denied.add(permission);
                  const key = `${plugin.id}:${permission}`;
                  const count = (this.denials.get(key) ?? 0) + 1;
                  this.denials.set(key, count);
                  if (count >= 3) await this.persist(plugin.id, permission, "blocked");
                }
                if (decision !== "deny") this.denials.delete(`${plugin.id}:${permission}`);
                this.pending.get(plugin.id)?.delete(permission);
              }
              this.assert(context);
              request.cleanup();
              remove();
              resolve(decision);
              for (const queued of [...this.requests]) {
                if (queued.session !== session || queued.deciding) continue;
                const states = this.rowState(plugin.id);
                if (
                  queued.prompt.permissions.every(
                    permission => states[permission] === "always" || states[permission] === "once"
                  )
                ) {
                  queued.cleanup();
                  this.requests = this.requests.filter(item => item !== queued);
                  queued.resolve(decision);
                } else if (
                  queued.prompt.permissions.some(permission => session.denied.has(permission))
                ) {
                  queued.cleanup();
                  this.requests = this.requests.filter(item => item !== queued);
                  queued.resolve("deny");
                }
              }
              this.publish();
            } catch (error) {
              request.cleanup();
              remove();
              reject(error);
              throw error;
            }
          },
        },
      };
      context.signal.addEventListener("abort", abort, { once: true });
      this.requests.push(request);
      this.publish();
    });
    this.assert(context);
    if (decision === "deny") throw new PluginPermissionError(missing[0], "denied");
  }
  async ensure(
    context: PluginContext,
    plugin: PluginOwner,
    permissions: readonly PluginPermission[]
  ) {
    await this.requestDecision(context, plugin, permissions);
    if (this.persistence.record) {
      const counts = this.usage.get(plugin.id) ?? { read: 0, write: 0, delete: 0 };
      for (const permission of permissions) {
        const kind = permission.split(":")[1];
        if (kind === "read" || kind === "write" || kind === "delete") counts[kind]++;
      }
      this.usage.set(plugin.id, counts);
      this.usageTimer ??= setTimeout(() => this.flushUsage(), 5000);
    }
  }
  private flushUsage() {
    this.usageTimer = undefined;
    for (const [id, counts] of this.usage)
      void this.persistence
        .record?.(id, counts)
        .catch(error => console.warn("插件调用计数保存失败", error));
    this.usage.clear();
  }
  async request(
    context: PluginContext,
    plugin: PluginOwner,
    permissions: readonly PluginPermission[]
  ) {
    try {
      await this.requestDecision(context, plugin, permissions);
      return true;
    } catch (error) {
      if (error instanceof PluginPermissionError) return false;
      throw error;
    }
  }
  private persist(pluginId: string, permission: PluginPermission, grant: PermissionGrant | null) {
    const write = this.writes.then(async () => {
      this.assert();
      await this.persistence.write(pluginId, permission, grant);
      this.assert();
      const next = { ...this.stored[pluginId] };
      if (grant) next[permission] = grant;
      else delete next[permission];
      this.stored = { ...this.stored, [pluginId]: next };
      this.publish();
    });
    this.writes = write.catch(() => undefined);
    return write;
  }
  async recover() {
    this.assert();
    if (!this.loadError || !this.persistence.recover) throw new Error("授权记录不需要重置");
    await this.persistence.recover();
    this.assert();
    this.ready = this.persistence.read().then(snapshot => {
      this.assert();
      this.stored = snapshot;
      this.loadError = undefined;
      this.publish();
    });
    await this.ready;
  }
  async usageFor(pluginId: string): Promise<PermissionUsage> {
    this.assert();
    const stored = (await this.persistence.usage?.(pluginId)) ?? { read: 0, write: 0, delete: 0 };
    this.assert();
    const pending = this.usage.get(pluginId);
    return {
      read: stored.read + (pending?.read ?? 0),
      write: stored.write + (pending?.write ?? 0),
      delete: stored.delete + (pending?.delete ?? 0),
    };
  }
  async requestPending(plugin: PluginOwner, permission: PluginPermission) {
    const session = this.sessions.get(plugin.id);
    if (!session || !this.pending.get(plugin.id)?.has(permission))
      throw new Error("请返回插件重新申请权限");
    return this.request(session.context, plugin, [permission]);
  }
  async reset(pluginId: string, permission: PluginPermission) {
    await this.ready;
    this.assert();
    // 撤权同时终结排队请求，避免旧确认再次授予已撤销的权限。
    for (const request of [...this.requests])
      if (
        request.prompt.plugin.id === pluginId &&
        request.prompt.permissions.includes(permission)
      ) {
        request.cleanup();
        request.reject(new PluginPermissionError(permission, "denied"));
        this.requests = this.requests.filter(item => item !== request);
      }
    const session = this.sessions.get(pluginId);
    session?.once.delete(permission);
    session?.denied.delete(permission);
    this.pending.get(pluginId)?.delete(permission);
    this.denials.delete(`${pluginId}:${permission}`);
    await this.persist(pluginId, permission, null);
  }
  dispose() {
    if (this.closed) return;
    if (this.usageTimer) clearTimeout(this.usageTimer);
    this.flushUsage();
    this.closed = true;
    for (const request of this.requests) {
      request.cleanup();
      request.reject(new Error("插件授权会话已结束"));
    }
    this.requests = [];
    this.sessions.clear();
    this.pending.clear();
    this.publish();
    this.listeners.clear();
  }
}
