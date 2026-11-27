import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  FileText,
  FolderKanban,
  Layers,
  ListTodo,
  Puzzle,
  Link,
  BookOpen,
} from "lucide-react";
import type {
  PluginContext,
  PluginEntityDescription,
  PluginEntityRef,
  PluginPermission,
} from "@tau/plugins";
import type { EntityRefProps } from "@tau/plugins/components";
import { usePluginComponentState } from "./component-scope";
import { usePluginHostI18n, type PluginHostMessageKey } from "./i18n";
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
type KindMeta = { labelKey: PluginHostMessageKey; icon: typeof Link };
const FALLBACK_META: KindMeta = { labelKey: "ref.kindFallback", icon: Link };
const META: Record<string, KindMeta> = {
  card: { labelKey: "ref.kindCard", icon: Layers },
  article: { labelKey: "ref.kindArticle", icon: FileText },
  document: { labelKey: "ref.kindDocument", icon: FileText },
  diary: { labelKey: "ref.kindDiary", icon: BookOpen },
  project: { labelKey: "ref.kindProject", icon: FolderKanban },
  todo: { labelKey: "ref.kindTodo", icon: ListTodo },
  event: { labelKey: "ref.kindEvent", icon: Calendar },
  "plugin-entity": { labelKey: "ref.kindPluginEntity", icon: Puzzle },
};

export function PluginEntityRef({ target, openable = true }: EntityRefProps) {
  const state = usePluginComponentState();
  const { t } = usePluginHostI18n();
  const { scope, runtime, revision, active } = state;
  const client = useQueryClient();
  const meta = META[target.kind] ?? FALLBACK_META;
  const Icon = meta.icon;
  const kindName = t(meta.labelKey);
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
  const label = presentation?.label || kindName;
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
        {t("ref.pluginPageUnavailable", { name: kindName })}
      </span>
    );
  if (!result)
    return (
      <span className={`${shell} text-ink-3`} aria-busy={!query.error}>
        {icon}
        {query.error ? t("ref.readFailed", { name: kindName }) : kindName}
      </span>
    );
  if (result.status === "missing")
    return (
      <span className={`${shell} text-ink-3`}>
        {icon}
        <span className="line-through">{kindName}</span>
        {t("ref.deleted")}
      </span>
    );
  if (result.status === "denied")
    return (
      <span className={`${shell} text-ink-2`}>
        {icon}
        {kindName}
        {result.permission ? (
          <button
            type="button"
            disabled={requesting}
            className="text-accent-text text-tau-meta px-1 py-1"
            onClick={() => result.permission && void request(result.permission)}
          >
            {t("ref.allowAccess")}
          </button>
        ) : (
          <span>{t("ref.notAllowed")}</span>
        )}
        {error && <span role="alert">{error}</span>}
      </span>
    );
  if (query.data?.unavailable)
    return (
      <span className={`${shell} text-ink-3`}>
        {icon}
        {t("ref.invalidated", { name: kindName })}
      </span>
    );
  const title = result.title || t("ref.untitled", { name: label });
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
