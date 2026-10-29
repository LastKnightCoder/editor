import { invoke } from "@tauri-apps/api/core";
import type { PluginContext, PluginEntityRef, PluginProjectNode } from "@tau/plugins";
import type { AppAdapter, PluginAppRunRequest, PluginOwner } from "@tau/plugins/host";
import type { MobileDataAdapter, MobileContentSnapshot } from "./data";

export type MobileAppActionInput =
  | Extract<
      PluginAppRunRequest,
      {
        action: "card.create" | "project.insertDocument";
      }
    >
  | { action: "content.share"; ref: string };
export type MobileActionDraft = Awaited<ReturnType<MobileDataAdapter["prepareContent"]>>;
export interface MobileAppActionRequest {
  id: number;
  plugin: PluginOwner;
  input: MobileAppActionInput;
  signal: AbortSignal;
  check(): void;
  close(): void;
  prepare(): Promise<MobileActionDraft>;
  shareTarget(): Promise<MobileContentSnapshot>;
  projects(
    cursor?: string
  ): Promise<{ items: { id: string; title: string; archived: boolean }[]; nextCursor?: string }>;
  tree(projectId: string): Promise<PluginProjectNode[] | null>;
  submit(value: {
    content: MobileActionDraft;
    tags: string[];
    title: string;
    projectId: string;
    parentId?: string;
  }): Promise<void>;
}
let sequence = 0;

export function createMobileAppActions(
  database: string,
  token: string,
  data: MobileDataAdapter,
  ready: (context: PluginContext) => Promise<void>,
  changed: () => void
) {
  let closed = false;
  let current: MobileAppActionRequest | null = null;
  let abortCurrent: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  const run: AppAdapter["run"] = (context, plugin, rawInput) => {
    if (!globalThis.navigator?.userActivation?.isActive)
      throw new Error("只能在用户点击或按键后调用");
    context.signal.throwIfAborted();
    if (closed || context.workspaceId !== database) throw new Error("插件工作区已失效");
    if (current) throw new Error("请先完成或关闭当前打开的窗口");
    if (
      rawInput.action !== "card.create" &&
      rawInput.action !== "project.insertDocument" &&
      rawInput.action !== "content.share"
    )
      throw new Error("移动端尚未开放此宿主界面动作");
    const input: MobileAppActionInput =
      rawInput.action === "content.share"
        ? { action: "content.share", ref: rawInput.ref }
        : (rawInput as MobileAppActionInput);
    return new Promise<PluginEntityRef | null | void>(resolve => {
      const controller = new AbortController();
      let submitting = false;
      const check = () => {
        context.signal.throwIfAborted();
        controller.signal.throwIfAborted();
        if (closed || current !== request) throw new Error("插件操作已失效");
      };
      const finish = (result: PluginEntityRef | null | void) => {
        if (controller.signal.aborted) return;
        controller.abort();
        context.signal.removeEventListener("abort", abort);
        if (current === request) {
          current = null;
          abortCurrent = undefined;
          emit();
        }
        resolve(result);
      };
      const abort = () => finish(input.action === "content.share" ? undefined : null);
      const read = async <T>(value: unknown): Promise<T> => {
        check();
        const result = await invoke<T>("plugin_data_read", {
          database,
          token,
          pluginId: context.pluginId,
          request: value,
        });
        check();
        return result;
      };
      const shareTarget = async () => {
        check();
        if (input.action !== "content.share") throw new Error("不是协作操作");
        await ready(context);
        const result = await read<MobileContentSnapshot | null>({
          method: "content",
          ref: input.ref,
        });
        if (!result || (!result.own && !result.owners.length))
          throw new Error("内容不存在或不支持协作");
        return result;
      };
      const request: MobileAppActionRequest = {
        id: ++sequence,
        plugin,
        input,
        signal: controller.signal,
        check,
        close() {
          if (!submitting) abort();
        },
        async prepare() {
          check();
          if (input.action === "content.share") throw new Error("不是新建操作");
          const content = input.content;
          if (content && "shareOf" in content) {
            await ready(context);
            const snapshot = await read<MobileContentSnapshot | null>({
              method: "content",
              ref: content.shareOf,
            });
            if (!snapshot?.own) throw new Error("只能共用本插件活跃实体的正文");
            const value = await data.prepareContent(context, { copyOf: content.shareOf });
            check();
            return value;
          }
          const value = await data.prepareContent(context, content);
          check();
          return value;
        },
        shareTarget,
        projects: cursor =>
          read({
            method: "query",
            entity: "project",
            query: { limit: 40, ...(cursor ? { cursor } : {}) },
          }),
        tree: projectId => read({ method: "projectTree", projectId }),
        async submit(value) {
          check();
          if (submitting) throw new Error("正在保存，请稍候");
          if (input.action === "content.share") throw new Error("不是新建操作");
          submitting = true;
          try {
            let content: MobileActionDraft | { shareOf: string };
            if (input.content && "shareOf" in input.content) {
              await ready(context);
              content = { shareOf: input.content.shareOf };
            } else {
              content = await data.prepareContent(context, {
                nodes: value.content.nodes,
                contracts: value.content.contracts,
              });
            }
            check();
            const entity = input.action === "card.create" ? "card" : "document";
            const result = await invoke<{ id: string }>("plugin_data_write", {
              database,
              token,
              pluginId: context.pluginId,
              request: {
                method: "create",
                entity,
                content,
                input:
                  entity === "card"
                    ? { tags: value.tags }
                    : {
                        title: value.title.trim() || "未命名文档",
                        projectId: value.projectId,
                        ...(value.parentId ? { parentId: value.parentId } : {}),
                      },
              },
            });
            check();
            changed();
            finish({ kind: entity, id: String(result.id) });
          } finally {
            submitting = false;
          }
        },
      };
      current = request;
      abortCurrent = abort;
      context.signal.addEventListener("abort", abort, { once: true });
      emit();
    });
  };
  return {
    run,
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      closed = true;
      abortCurrent?.();
      listeners.clear();
    },
  };
}
export type MobileAppActions = ReturnType<typeof createMobileAppActions>;
