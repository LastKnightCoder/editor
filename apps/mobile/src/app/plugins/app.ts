import { invoke } from "@tauri-apps/api/core";
import type { PluginContext, PluginEntityKind, PluginPickedEntity } from "@tau/plugins";
import type { AppAdapter } from "@tau/plugins/host";
import type { Navigator } from "../../router/navigatorTypes";
import { navigateMobileEntity } from "./entityNavigation";
import {
  mobileEntityKind,
  type MobileEntityCandidate,
  type MobileEntityOpenTarget,
  type MobileEntityPickRequest,
  type MobilePluginEntityTarget,
  type MobileEntityOpenOptions,
} from "./app-types";

let nextRequestId = 0;
const candidateKey = (item: MobileEntityCandidate) =>
  JSON.stringify([item.ref.kind, item.ref.id, item.identity]);

export function createMobileApp(
  database: string,
  token: string,
  navigation: Pick<Navigator, "push">,
  canRead: (context: PluginContext, kind: PluginEntityKind) => Promise<boolean>,
  openEntity?: (
    target: MobilePluginEntityTarget,
    options: MobileEntityOpenOptions,
    callerGuard: () => void
  ) => Promise<void>
) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let disposed = false;
  let request: MobileEntityPickRequest | null = null;
  let abortPending: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  const active = (context: PluginContext) => {
    context.signal.throwIfAborted();
    if (disposed || context.workspaceId !== database) throw new Error("插件工作区已失效");
  };
  const gesture = () => {
    if (!globalThis.navigator?.userActivation?.isActive)
      throw new Error("只能在用户点击或按键后调用");
  };
  const refs = async <T>(context: PluginContext, value: unknown): Promise<T> => {
    active(context);
    const result = await invoke<T>("plugin_app_refs", {
      database,
      token,
      pluginId: context.pluginId,
      request: value,
      timeZone,
    });
    active(context);
    return result;
  };

  const adapter: AppAdapter = {
    pick(context, plugin, options) {
      gesture();
      active(context);
      options.kinds.forEach(kind => mobileEntityKind({ kind }));
      if (request) throw new Error("请先完成或取消当前内容选择");
      return new Promise<PluginPickedEntity[]>(resolve => {
        const controller = new AbortController();
        const issued = new Set<string>();
        let submitting = false;
        const check = () => {
          active(context);
          controller.signal.throwIfAborted();
        };
        const finish = (picked: PluginPickedEntity[]) => {
          if (controller.signal.aborted) return;
          controller.abort();
          context.signal.removeEventListener("abort", abort);
          globalThis.document?.removeEventListener("visibilitychange", visibility);
          if (request === current) {
            request = null;
            abortPending = null;
            emit();
          }
          resolve(picked);
        };
        const abort = () => finish([]);
        const cancel = () => {
          if (!submitting) finish([]);
        };
        const visibility = () => {
          if (globalThis.document?.visibilityState === "hidden") cancel();
        };
        const current: MobileEntityPickRequest = {
          id: ++nextRequestId,
          plugin,
          options,
          signal: controller.signal,
          async query(input) {
            check();
            input.signal.throwIfAborted();
            if (!options.kinds.includes(input.kind)) throw new Error("该类型不在本次选择范围内");
            const result = await invoke<{
              items: MobileEntityCandidate[];
              nextCursor?: string;
            }>("plugin_app_query", {
              database,
              token,
              pluginId: context.pluginId,
              kind: input.kind,
              keyword: input.keyword,
              cursor: input.cursor,
              limit: input.limit,
              timeZone,
            });
            check();
            input.signal.throwIfAborted();
            result.items.forEach(item => issued.add(candidateKey(item)));
            return result;
          },
          async submit(items) {
            check();
            if (submitting) throw new Error("正在确认选择");
            if (!items.length) return cancel();
            if (items.length > 200 || (!options.multiple && items.length !== 1))
              throw new Error("选择数量无效");
            if (items.some(item => !issued.has(candidateKey(item))))
              throw new Error("选择内容已失效，请重新搜索");
            const unique = new Set(items.map(item => JSON.stringify(item.ref)));
            if (unique.size !== items.length) throw new Error("不能重复选择同一内容");
            submitting = true;
            try {
              const picked = await refs<PluginPickedEntity[]>(context, {
                method: "grant",
                selections: items.map(({ ref, identity }) => ({ ref, identity })),
              });
              check();
              finish(picked.map(({ ref, title }) => ({ ref, title })));
            } finally {
              submitting = false;
            }
          },
          cancel,
        };
        context.signal.addEventListener("abort", abort, { once: true });
        globalThis.document?.addEventListener("visibilitychange", visibility);
        request = current;
        abortPending = abort;
        emit();
      });
    },
    async open(context, ref, options) {
      gesture();
      active(context);
      mobileEntityKind(ref);
      if (options.placement !== "page") throw new Error("移动端仅支持在页面中打开内容");
      if (options.at && ref.kind !== "plugin-entity")
        throw new Error("移动端尚未开放指定正文块位置");
      const target = await refs<MobileEntityOpenTarget>(context, { method: "resolve", ref });
      active(context);
      if (target.kind === "plugin-entity") {
        if (!openEntity) throw new Error("插件内容打开入口尚未就绪");
        await openEntity(target, options, () => active(context));
        active(context);
        return;
      }
      navigateMobileEntity(navigation, target, options);
    },
    async describe(context, values, readable) {
      active(context);
      values.forEach(mobileEntityKind);
      const allowed: PluginEntityKind[] = [];
      for (const kind of readable) {
        if (await canRead(context, kind)) allowed.push(kind);
      }
      const result = await refs<Awaited<ReturnType<AppAdapter["describe"]>>>(context, {
        method: "describe",
        refs: values,
        readable: allowed,
      });
      for (const kind of allowed) {
        if (!(await canRead(context, kind))) throw new Error("读取授权已变化，请重新获取引用信息");
      }
      active(context);
      return result;
    },
    async run() {
      throw new Error("移动端尚未开放宿主界面动作");
    },
  };
  return {
    async presentation(
      context: PluginContext,
      ref: import("@tau/plugins").PluginEntityRef
    ): Promise<{ label: string; icon: string } | null> {
      return refs(context, { method: "presentation", ref });
    },
    async getEntityTarget(id: number): Promise<MobilePluginEntityTarget | null> {
      if (disposed) throw new Error("插件工作区已失效");
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("插件内容身份无效");
      const result = await invoke<MobilePluginEntityTarget | null>("plugin_entity_target", {
        database,
        token,
        id,
      });
      if (disposed) throw new Error("插件工作区已失效");
      return result;
    },
    adapter,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => request,
    dispose() {
      disposed = true;
      abortPending?.();
      listeners.clear();
    },
  };
}

export type MobileAppAdapter = ReturnType<typeof createMobileApp>;
