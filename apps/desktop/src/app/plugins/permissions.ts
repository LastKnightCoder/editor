import { create } from "zustand";
import {
  PluginPermissionError,
  type PluginContext,
  type PluginPermission,
  type PluginPermissionState,
} from "@tau/plugins";
import type { PermissionsAdapter, PluginOwner } from "@tau/plugins/host";
import { off, on } from "@/electron";
import {
  getPluginPermissionSnapshot,
  getPluginUsage,
  recordPluginUsage,
  setPluginPermission,
} from "@/commands/plugin-permissions";
import type { PluginPermissionSnapshot, PluginUsageKind } from "@/types/plugin-permissions";

/** 弹窗的三种答复；关闭弹窗按拒绝处理 */
export type PermissionDecision = "once" | "always" | "deny";

export interface PermissionPrompt {
  id: number;
  plugin: PluginOwner;
  permissions: PluginPermission[];
  settle(decision: PermissionDecision): void;
  /** 宿主回收（切库、关闭）时撤下弹窗，不算作用户拒绝 */
  cancel(reason: unknown): void;
}

/** 插件详情页展示的单项状态 */
export type PermissionRowState = "always" | "once" | "blocked" | "none";

interface PermissionUiState {
  /** 排队中的授权弹窗，第一项正在显示 */
  prompts: PermissionPrompt[];
  /** 应用不在前台时发起、尚未询问的请求：插件 ID → 权限 */
  pending: Record<string, PluginPermission[]>;
}

/** 弹窗与待处理请求归壳层浮层消费；窗口内只有一个插件运行时在用 */
export const usePluginPermissionUi = create<PermissionUiState>()(() => ({
  prompts: [],
  pending: {},
}));

/** 连续拒绝达到此次数后转为已阻止，不再弹窗 */
export const BLOCK_AFTER_DENIALS = 3;
const USAGE_FLUSH_MS = 5000;
let nextPromptId = 0;

const canPromptNow = () =>
  typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();

interface Session {
  context: PluginContext;
  granted: Set<PluginPermission>;
  denied: Set<PluginPermission>;
}

/**
 * 桌面授权：「始终允许」与「已阻止」由主进程按插件 × 工作区持久化；「仅这次」和本次拒绝只在
 * 当前激活实例内有效，停用、重载、切库或重启后失效。插件与应用同环境执行，这里约束的是
 * SDK 接口，不是安全隔离。
 */
export class DesktopPermissionBroker implements PermissionsAdapter {
  private persistent: PluginPermissionSnapshot = {};
  private readonly sessions = new Map<string, Session>();
  private readonly denials = new Map<string, number>();
  private readonly unflushed = new Map<string, Record<PluginUsageKind, number>>();
  private readonly listeners = new Set<() => void>();
  private usageTimer?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private disposed = false;
  private loading: Promise<void>;

  constructor(
    private readonly workspaceId: string,
    private readonly canPrompt: () => boolean = canPromptNow
  ) {
    this.loading = this.reload();
    on("plugin-permissions:changed", this.onChanged);
  }

  private onChanged = (_event: unknown, workspaceId: string) => {
    if (workspaceId === this.workspaceId) this.loading = this.reload();
  };

  private async reload() {
    try {
      const snapshot = await getPluginPermissionSnapshot(this.workspaceId);
      if (this.disposed) return;
      this.persistent = snapshot;
      this.changed();
    } catch (error) {
      console.error("读取插件授权失败", error);
    }
  }

  getRevision = () => this.revision;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  private changed() {
    this.revision++;
    for (const listener of this.listeners) listener();
  }

  private session(context: PluginContext): Session {
    let session = this.sessions.get(context.pluginId);
    if (!session || session.context !== context) {
      session = { context, granted: new Set(), denied: new Set() };
      this.sessions.set(context.pluginId, session);
    }
    return session;
  }

  /** 当前激活实例的会话；插件已停用或重新激活过则视为无会话 */
  private liveSession(pluginId: string): Session | undefined {
    const session = this.sessions.get(pluginId);
    return session && !session.context.signal.aborted ? session : undefined;
  }

  rowState(pluginId: string, permission: PluginPermission): PermissionRowState {
    const stored = this.persistent[pluginId]?.[permission];
    if (stored === "granted") return "always";
    if (stored === "blocked") return "blocked";
    return this.liveSession(pluginId)?.granted.has(permission) ? "once" : "none";
  }

  async query(context: PluginContext, permission: PluginPermission) {
    await this.loading;
    const state = this.rowState(context.pluginId, permission);
    if (state === "always" || state === "once") return "granted" satisfies PluginPermissionState;
    if (state === "blocked" || this.session(context).denied.has(permission)) return "denied";
    return "prompt";
  }

  async ensure(
    context: PluginContext,
    plugin: PluginOwner,
    permissions: readonly PluginPermission[]
  ) {
    await this.loading;
    const missing = this.missing(context, permissions);
    for (const permission of missing) {
      if (this.rowState(plugin.id, permission) === "blocked")
        throw new PluginPermissionError(permission, "blocked");
      if (this.session(context).denied.has(permission))
        throw new PluginPermissionError(permission, "denied");
    }
    if (missing.length) {
      if (!this.canPrompt()) {
        this.addPending(plugin.id, missing);
        throw new PluginPermissionError(missing[0], "unavailable");
      }
      const decision = await this.prompt(context, plugin, missing);
      await this.apply(context, plugin.id, missing, decision);
      if (decision === "deny") throw new PluginPermissionError(missing[0], "denied");
    }
    for (const permission of permissions) this.countUsage(plugin.id, permission);
  }

  async request(
    context: PluginContext,
    plugin: PluginOwner,
    permissions: readonly PluginPermission[]
  ) {
    await this.loading;
    const missing = this.missing(context, permissions);
    if (!missing.length) return true;
    if (missing.some(permission => this.rowState(plugin.id, permission) === "blocked"))
      return false;
    if (!this.canPrompt()) {
      this.addPending(plugin.id, missing);
      return false;
    }
    const decision = await this.prompt(context, plugin, missing);
    await this.apply(context, plugin.id, missing, decision);
    return decision !== "deny";
  }

  private missing(context: PluginContext, permissions: readonly PluginPermission[]) {
    this.session(context);
    return permissions.filter(permission => {
      const state = this.rowState(context.pluginId, permission);
      return state !== "always" && state !== "once";
    });
  }

  private prompt(
    context: PluginContext,
    plugin: PluginOwner,
    permissions: PluginPermission[]
  ): Promise<PermissionDecision> {
    context.signal.throwIfAborted();
    return new Promise<PermissionDecision>((resolve, reject) => {
      const ui = usePluginPermissionUi.getState();
      // 同一插件已排队（尚未显示）的请求合并为一个弹窗；正在显示的不追加内容，避免误点
      const queued = ui.prompts.slice(1).find(item => item.plugin.id === plugin.id);
      const onAbort = () => {
        remove();
        reject(context.signal.reason);
      };
      const remove = () =>
        usePluginPermissionUi.setState(state => ({
          prompts: state.prompts.filter(item => item !== prompt),
        }));
      const finish = () => context.signal.removeEventListener("abort", onAbort);
      let prompt: PermissionPrompt;
      if (queued) {
        prompt = {
          ...queued,
          permissions: [...new Set([...queued.permissions, ...permissions])],
          settle: decision => {
            remove();
            queued.settle(decision);
            finish();
            resolve(decision);
          },
          cancel: reason => {
            remove();
            queued.cancel(reason);
            finish();
            reject(reason);
          },
        };
        usePluginPermissionUi.setState(state => ({
          prompts: state.prompts.map(item => (item === queued ? prompt : item)),
        }));
      } else {
        prompt = {
          id: ++nextPromptId,
          plugin,
          permissions,
          settle: decision => {
            remove();
            finish();
            resolve(decision);
          },
          cancel: reason => {
            remove();
            finish();
            reject(reason);
          },
        };
        usePluginPermissionUi.setState(state => ({ prompts: [...state.prompts, prompt] }));
      }
      context.signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private async apply(
    context: PluginContext,
    pluginId: string,
    permissions: PluginPermission[],
    decision: PermissionDecision
  ) {
    const session = this.session(context);
    this.clearPending(pluginId, permissions);
    for (const permission of permissions) {
      const key = `${pluginId}\n${permission}`;
      if (decision === "once") session.granted.add(permission);
      else if (decision === "always") {
        this.denials.delete(key);
        await this.persist(pluginId, permission, "granted");
      } else {
        session.denied.add(permission);
        const count = (this.denials.get(key) ?? 0) + 1;
        this.denials.set(key, count);
        if (count >= BLOCK_AFTER_DENIALS) await this.persist(pluginId, permission, "blocked");
      }
    }
    this.changed();
  }

  private async persist(
    pluginId: string,
    permission: PluginPermission,
    grant: "granted" | "blocked" | null
  ) {
    await setPluginPermission(this.workspaceId, pluginId, permission, grant);
    const current = { ...this.persistent[pluginId] };
    if (grant) current[permission] = grant;
    else delete current[permission];
    this.persistent = { ...this.persistent, [pluginId]: current };
  }

  /** 插件详情页：处理待处理请求或直接授予 */
  async grant(pluginId: string, permission: PluginPermission, decision: "once" | "always") {
    this.clearPending(pluginId, [permission]);
    if (decision === "always") {
      this.denials.delete(`${pluginId}\n${permission}`);
      await this.persist(pluginId, permission, "granted");
    } else {
      const session = this.liveSession(pluginId);
      if (!session) throw new Error("插件未启用，无法仅本次允许");
      session.granted.add(permission);
      session.denied.delete(permission);
    }
    this.changed();
  }

  /** 撤销授权或解除阻止，回到「下次使用时询问」 */
  async reset(pluginId: string, permission: PluginPermission) {
    this.clearPending(pluginId, [permission]);
    this.denials.delete(`${pluginId}\n${permission}`);
    const session = this.liveSession(pluginId);
    session?.granted.delete(permission);
    session?.denied.delete(permission);
    if (this.persistent[pluginId]?.[permission]) await this.persist(pluginId, permission, null);
    this.changed();
  }

  /** 最近几天的调用次数（含尚未落盘的本轮计数） */
  async usage(pluginId: string) {
    const stored = await getPluginUsage(this.workspaceId, pluginId);
    const pending = this.unflushed.get(pluginId);
    return pending
      ? {
          ...stored,
          read: stored.read + pending.read,
          write: stored.write + pending.write,
          delete: stored.delete + pending.delete,
        }
      : stored;
  }

  dismissPending(pluginId: string, permission: PluginPermission) {
    this.clearPending(pluginId, [permission]);
  }

  private addPending(pluginId: string, permissions: PluginPermission[]) {
    usePluginPermissionUi.setState(state => ({
      pending: {
        ...state.pending,
        [pluginId]: [...new Set([...(state.pending[pluginId] ?? []), ...permissions])],
      },
    }));
  }

  private clearPending(pluginId: string, permissions: PluginPermission[]) {
    usePluginPermissionUi.setState(state => {
      const rest = (state.pending[pluginId] ?? []).filter(item => !permissions.includes(item));
      const pending = { ...state.pending };
      if (rest.length) pending[pluginId] = rest;
      else delete pending[pluginId];
      return { pending };
    });
  }

  private countUsage(pluginId: string, permission: PluginPermission) {
    const kind = permission.split(":")[1] as PluginUsageKind;
    const counts = this.unflushed.get(pluginId) ?? { read: 0, write: 0, delete: 0 };
    counts[kind] += 1;
    this.unflushed.set(pluginId, counts);
    this.usageTimer ??= setTimeout(() => this.flushUsage(), USAGE_FLUSH_MS);
  }

  private flushUsage() {
    this.usageTimer = undefined;
    for (const [pluginId, counts] of this.unflushed)
      void recordPluginUsage(this.workspaceId, pluginId, counts).catch(error =>
        console.error("记录插件调用失败", error)
      );
    this.unflushed.clear();
  }

  dispose() {
    this.disposed = true;
    off("plugin-permissions:changed", this.onChanged);
    if (this.usageTimer) clearTimeout(this.usageTimer);
    this.flushUsage();
    for (const prompt of usePluginPermissionUi.getState().prompts)
      prompt.cancel(new Error("插件运行环境已关闭"));
    usePluginPermissionUi.setState({ prompts: [], pending: {} });
    this.listeners.clear();
  }
}
