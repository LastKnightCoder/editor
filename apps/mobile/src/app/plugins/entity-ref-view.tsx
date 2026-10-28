import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, FileText, FolderKanban, Layers, ListTodo, Puzzle, Link } from "lucide-react";
import type {
  PluginContext,
  PluginEntityDescription,
  PluginEntityRef,
  PluginPermission,
} from "@tau/plugins";
import type { EntityRefProps } from "@tau/plugins/components";
import { usePluginComponentState } from "./component-scope";
import { EntityKindIcon } from "../../features/context/EntityKindIcon";

const pending = new WeakMap<
  PluginContext,
  Array<{
    ref: PluginEntityRef;
    resolve(value: PluginEntityDescription | PromiseLike<PluginEntityDescription>): void;
    reject(error: unknown): void;
  }>
>();
function describeBatched(context: PluginContext, ref: PluginEntityRef) {
  return new Promise<PluginEntityDescription>((resolve, reject) => {
    let queue = pending.get(context);
    if (!queue) {
      queue = [];
      pending.set(context, queue);
      queueMicrotask(() => {
        const batch = pending.get(context) ?? [];
        pending.delete(context);
        for (let start = 0; start < batch.length; start += 200) {
          const slice = batch.slice(start, start + 200);
          const result = Promise.resolve().then(() =>
            context.app.describe(slice.map(item => item.ref))
          );
          slice.forEach((item, index) => {
            void result
              .then(values => {
                const description = values[index];
                if (!description) throw new Error("引用描述缺失");
                item.resolve(description);
              })
              .catch(item.reject);
          });
        }
      });
    }
    queue.push({ ref, resolve, reject });
  });
}
const META = {
  card: { label: "卡片", icon: Layers },
  article: { label: "文章", icon: FileText },
  document: { label: "项目文档", icon: FileText },
  project: { label: "项目", icon: FolderKanban },
  todo: { label: "待办", icon: ListTodo },
  event: { label: "日程", icon: Calendar },
  "plugin-entity": { label: "插件内容", icon: Puzzle },
};

export function PluginEntityRef({ target, openable = true }: EntityRefProps) {
  const state = usePluginComponentState();
  const { scope, runtime, revision, active } = state;
  const client = useQueryClient();
  const meta = META[target.kind as keyof typeof META] ?? { label: "内容引用", icon: Link };
  const Icon = meta.icon;
  const query = useQuery({
    queryKey: ["plugin-entity-component", scope?.id, target.kind, target.id, revision],
    enabled: active,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      if (!scope || !state.isActive()) throw new Error("插件组件会话已失效");
      const result = await describeBatched(scope.context, target);
      const needsPresentation = target.kind === "plugin-entity" && result.status === "ok";
      const presentation = needsPresentation
        ? ((await runtime?.app?.presentation(scope.context, target)) ?? null)
        : null;
      signal.throwIfAborted();
      if (!state.isActive() || runtime?.permissions?.getSnapshot() !== revision)
        throw new Error("引用访问状态已变化");
      return { description: result, presentation, unavailable: needsPresentation && !presentation };
    },
  });
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const request = async (permission: PluginPermission) => {
    if (!scope || !state.isActive() || requesting) return;
    setRequesting(true);
    setError("");
    try {
      await scope.context.permissions.request([permission]);
    } catch (failure) {
      if (state.isActive()) setError(String(failure));
    } finally {
      if (state.isActive()) {
        setRequesting(false);
        void client.invalidateQueries({ queryKey: ["plugin-entity-component", scope.id] });
      }
    }
  };
  const open = () => {
    if (!scope || !state.isActive()) return;
    void scope.context.app.open(target).catch(failure => {
      if (state.isActive()) setError(String(failure));
    });
  };
  const shell = "text-tau-body inline-flex max-w-full min-w-0 items-center gap-1.5 align-middle";
  const result = active ? query.data?.description : undefined;
  const presentation =
    result?.status === "ok" && !query.data?.unavailable ? query.data?.presentation : null;
  const label = presentation?.label || meta.label;
  const icon = (
    <EntityKindIcon
      svg={presentation?.icon}
      fallback={Icon}
      size={16}
      className="text-ink-3 shrink-0"
    />
  );
  if (!scope || !active)
    return (
      <span className={`${shell} text-ink-3`}>
        {icon}
        {meta.label}（插件页面不可用）
      </span>
    );
  if (!result)
    return (
      <span className={`${shell} text-ink-3`} aria-busy={!query.error}>
        {icon}
        {meta.label}
        {query.error ? "（读取失败）" : ""}
      </span>
    );
  if (result.status === "missing")
    return (
      <span className={`${shell} text-ink-3`}>
        {icon}
        <span className="line-through">{meta.label}</span>已删除
      </span>
    );
  if (result.status === "denied")
    return (
      <span className={`${shell} text-ink-2`}>
        {icon}
        {meta.label}
        {result.permission ? (
          <button
            type="button"
            disabled={requesting}
            className="text-accent-text text-tau-meta px-1 py-1"
            onClick={() => result.permission && void request(result.permission)}
          >
            允许访问
          </button>
        ) : (
          <span>未获准查看</span>
        )}
        {error && <span role="alert">{error}</span>}
      </span>
    );
  if (query.data?.unavailable)
    return (
      <span className={`${shell} text-ink-3`}>
        {icon}
        {meta.label}（引用已失效）
      </span>
    );
  const title = result.title || `无标题${label}`;
  const kindLabel = presentation ? (
    <span className="text-ink-3 text-tau-meta shrink-0">{label}</span>
  ) : null;
  return (
    <span className={shell}>
      {openable ? (
        <button
          type="button"
          className={`${shell} text-ink-1 text-left`}
          title={title}
          onClick={open}
        >
          {icon}
          {kindLabel}
          <span className="truncate">{title}</span>
        </button>
      ) : (
        <span className={`${shell} text-ink-1`} title={title}>
          {icon}
          {kindLabel}
          <span className="truncate">{title}</span>
        </span>
      )}
      {error && (
        <span role="alert" className="text-ink-2 text-tau-meta">
          {error}
        </span>
      )}
    </span>
  );
}
