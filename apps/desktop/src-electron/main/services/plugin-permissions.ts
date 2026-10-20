import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isPluginPermission } from "@tau/plugins/package";
import type {
  PluginPermissionGrant,
  PluginPermissionSnapshot,
  PluginPermissionUsage,
  PluginUsageKind,
} from "@/types/plugin-permissions";

type UsageDay = Record<PluginUsageKind, number>;
interface PermissionFile {
  version: 1;
  backendGrants?: Record<string, Record<string, string>>;
  /** 工作区 → 插件 → 权限 → 持久决定；「仅这次」只存在渲染端内存 */
  grants: Record<string, Record<string, Record<string, PluginPermissionGrant>>>;
  /** 工作区 → 插件 → 本地日期 → 调用计数 */
  usage: Record<string, Record<string, Record<string, UsageDay>>>;
}

export const USAGE_DAYS = 7;
const USAGE_KINDS: readonly PluginUsageKind[] = ["read", "write", "delete"];

const localDay = (time: number) => {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const recentDays = (now: number) =>
  new Set(Array.from({ length: USAGE_DAYS }, (_, index) => localDay(now - index * 86_400_000)));

function assertKey(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value || value.length > 200 || /[\0/\\]/.test(value))
    throw new Error(`${name}无效`);
}

function parse(raw: string): PermissionFile {
  const value = JSON.parse(raw) as PermissionFile;
  if (value?.version !== 1 || typeof value.grants !== "object" || typeof value.usage !== "object")
    throw new Error("插件权限文件格式无效");
  return value;
}

/** 主进程单实例串行读改写；损坏文件不覆盖，保留给用户排查。 */
export class PluginPermissionStore {
  private pending: Promise<unknown> = Promise.resolve();
  private readonly backendSessions = new Map<string, Map<string, string>>();
  constructor(
    private readonly filename: string,
    private readonly now: () => number = Date.now
  ) {}

  private transact<T>(operation: (file: PermissionFile) => T, save = true): Promise<T> {
    const result = this.pending.then(async () => {
      let file: PermissionFile;
      try {
        file = parse(await readFile(this.filename, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        file = { version: 1, grants: {}, usage: {} };
      }
      const value = operation(file);
      if (save) {
        await mkdir(path.dirname(this.filename), { recursive: true });
        const temporary = `${this.filename}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, JSON.stringify(file), { flag: "wx", mode: 0o600 });
          await rename(temporary, this.filename);
        } finally {
          await rm(temporary, { force: true });
        }
      }
      return structuredClone(value);
    });
    this.pending = result.catch(() => undefined);
    return result;
  }

  async snapshot(workspaceId: string): Promise<PluginPermissionSnapshot> {
    assertKey(workspaceId, "工作区");
    return this.transact(file => file.grants[workspaceId] ?? {}, false);
  }

  async backendGranted(pluginId: string, scope: string, digest: string): Promise<boolean> {
    assertKey(pluginId, "插件 ID");
    assertKey(scope, "后台作用域");
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("后台摘要无效");
    return this.transact(
      file =>
        this.backendSessions.get(pluginId)?.get(scope) === digest ||
        file.backendGrants?.[pluginId]?.[scope] === digest,
      false
    );
  }

  async setBackend(
    pluginId: string,
    scope: string,
    digest: string,
    decision: "once" | "always" | null
  ): Promise<void> {
    assertKey(pluginId, "插件 ID");
    assertKey(scope, "后台作用域");
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("后台摘要无效");
    if (decision !== "once" && decision !== "always" && decision !== null)
      throw new Error("后台授权决定无效");
    await this.transact(file => {
      const grants = (file.backendGrants ??= Object.create(null));
      const scopes = Object.hasOwn(grants, pluginId)
        ? grants[pluginId]
        : (grants[pluginId] = Object.create(null));
      if (decision === "always") scopes[scope] = digest;
      else delete scopes[scope];
      if (!Object.keys(scopes).length) delete grants[pluginId];
    });
    if (decision === "once") {
      let scopes = this.backendSessions.get(pluginId);
      if (!scopes) this.backendSessions.set(pluginId, (scopes = new Map()));
      scopes.set(scope, digest);
    } else this.backendSessions.get(pluginId)?.delete(scope);
  }

  clearBackendSession(pluginId: string, scope?: string) {
    if (scope) this.backendSessions.get(pluginId)?.delete(scope);
    else this.backendSessions.delete(pluginId);
  }

  async set(
    workspaceId: string,
    pluginId: string,
    permission: string,
    grant: PluginPermissionGrant | null
  ): Promise<void> {
    assertKey(workspaceId, "工作区");
    assertKey(pluginId, "插件 ID");
    if (!isPluginPermission(permission)) throw new Error("未知的插件权限");
    if (grant !== null && grant !== "granted" && grant !== "blocked")
      throw new Error("授权状态无效");
    return this.transact(file => {
      const plugins = (file.grants[workspaceId] ??= {});
      const permissions = (plugins[pluginId] ??= {});
      if (grant) permissions[permission] = grant;
      else delete permissions[permission];
      if (!Object.keys(permissions).length) delete plugins[pluginId];
      if (!Object.keys(plugins).length) delete file.grants[workspaceId];
    });
  }

  /** 卸载插件时清除它在所有工作区的授权与记录 */
  async forget(pluginId: string): Promise<void> {
    assertKey(pluginId, "插件 ID");
    this.backendSessions.delete(pluginId);
    return this.transact(file => {
      if (file.backendGrants) delete file.backendGrants[pluginId];
      for (const section of [file.grants, file.usage])
        for (const [workspaceId, plugins] of Object.entries(section)) {
          delete plugins[pluginId];
          if (!Object.keys(plugins).length) delete section[workspaceId];
        }
    });
  }

  async record(
    workspaceId: string,
    pluginId: string,
    counts: Partial<Record<PluginUsageKind, number>>
  ): Promise<void> {
    assertKey(workspaceId, "工作区");
    assertKey(pluginId, "插件 ID");
    const now = this.now();
    return this.transact(file => {
      const days = ((file.usage[workspaceId] ??= {})[pluginId] ??= {});
      const keep = recentDays(now);
      for (const day of Object.keys(days)) if (!keep.has(day)) delete days[day];
      const today = (days[localDay(now)] ??= { read: 0, write: 0, delete: 0 });
      for (const kind of USAGE_KINDS) {
        const count = counts[kind];
        if (count !== undefined) {
          if (!Number.isSafeInteger(count) || count < 0) throw new Error("调用计数无效");
          today[kind] = (today[kind] ?? 0) + count;
        }
      }
    });
  }

  async usage(workspaceId: string, pluginId: string): Promise<PluginPermissionUsage> {
    assertKey(workspaceId, "工作区");
    assertKey(pluginId, "插件 ID");
    const keep = recentDays(this.now());
    return this.transact(file => {
      const total: PluginPermissionUsage = { days: USAGE_DAYS, read: 0, write: 0, delete: 0 };
      for (const [day, counts] of Object.entries(file.usage[workspaceId]?.[pluginId] ?? {}))
        if (keep.has(day)) for (const kind of USAGE_KINDS) total[kind] += counts[kind] ?? 0;
      return total;
    }, false);
  }
}
