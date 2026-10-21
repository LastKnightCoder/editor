import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn, toast } from "@tau/ui";
import type {
  PluginContext,
  PluginEntityDescription,
  PluginEntityRef,
  PluginPermission,
} from "@tau/plugins";
import type { EntityRefProps } from "@tau/plugins/components";
import { useEntityKindMeta } from "@/components/EntityKind";
import { ENTITY_KIND_META } from "@/components/EntityPicker/meta";
import type { EntityKind } from "@/types";
import useSettingStore from "@/stores/useSettingStore";
import { PICKER_KINDS } from "./app";
import { useDesktopPlugins } from "./context";
import { usePluginComponentScope } from "./component-scope";

const noopSubscribe = () => () => undefined;
const zero = () => 0;
const BATCH_LIMIT = 200;

/** 同一轮渲染里同一插件的引用合并成一次 describe，避免列表逐项走一次 IPC */
const pending = new WeakMap<
  PluginContext,
  Array<{ ref: PluginEntityRef; settle(result: Promise<PluginEntityDescription>): void }>
>();

function describeBatched(context: PluginContext, ref: PluginEntityRef) {
  return new Promise<PluginEntityDescription>(resolve => {
    let queue = pending.get(context);
    if (!queue) {
      queue = [];
      pending.set(context, queue);
      queueMicrotask(() => {
        const batch = pending.get(context) ?? [];
        pending.delete(context);
        for (let start = 0; start < batch.length; start += BATCH_LIMIT) {
          const slice = batch.slice(start, start + BATCH_LIMIT);
          const results = context.app.describe(slice.map(item => item.ref));
          slice.forEach((item, index) => item.settle(results.then(list => list[index])));
        }
      });
    }
    queue.push({ ref, settle: resolve });
  });
}

/** 插件引用类型的图标与类型名；材料按 ID 前缀区分划线、PDF 标注与剪藏 */
function kindOf(target: PluginEntityRef): EntityKind {
  if (target.kind === "material") {
    const prefix = target.id.split(":")[0] as EntityKind;
    if (PICKER_KINDS.material.includes(prefix)) return prefix;
  }
  return PICKER_KINDS[target.kind][0];
}

export function PluginEntityRef({ target, openable = true }: EntityRefProps) {
  const context = usePluginComponentScope();
  const broker = useDesktopPlugins()?.permissions;
  const revision = useSyncExternalStore(
    broker?.subscribe ?? noopSubscribe,
    broker?.getRevision ?? zero
  );
  const databaseName = useSettingStore(state => state.setting.database.active);
  const kind = kindOf(target);
  const meta = useEntityKindMeta(
    kind === "plugin-entity" ? { kind, id: Number(target.id) } : undefined,
    ENTITY_KIND_META[kind]
  );
  const description = useQuery({
    queryKey: [
      "plugins",
      "entity-ref",
      databaseName,
      context?.pluginId,
      target.kind,
      target.id,
      revision,
    ],
    queryFn: () => describeBatched(context!, { kind: target.kind, id: target.id }),
    enabled: Boolean(context),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const [requesting, setRequesting] = useState(false);
  const Icon = meta.icon;
  const result = description.data;

  const open = () => {
    if (!context) return;
    context.app.open(target).catch(error => {
      toast.error(error instanceof Error ? error.message : "打开失败");
    });
  };
  const request = async (permission: PluginPermission) => {
    if (!context) return;
    setRequesting(true);
    try {
      await context.permissions.request([permission]);
    } catch (error) {
      console.error("申请插件权限失败", error);
    } finally {
      setRequesting(false);
      void description.refetch();
    }
  };

  const shell = "text-tau-body inline-flex max-w-full min-w-0 items-center gap-1.5 align-middle";
  const icon = <Icon className="text-ink-3 size-4 shrink-0" strokeWidth={1.75} aria-hidden />;

  if (!context)
    return (
      <span className={cn(shell, "text-ink-3")}>
        {icon}
        {meta.label}（只能在插件页面中显示）
      </span>
    );
  if (!result)
    return (
      <span className={cn(shell, "text-ink-3")} aria-busy>
        {icon}
        {description.error ? `${meta.label}（读取失败）` : meta.label}
      </span>
    );
  if (result.status === "missing")
    return (
      <span className={cn(shell, "text-ink-3")}>
        {icon}
        <span className="line-through">{meta.label}</span>
        <span>已删除</span>
      </span>
    );
  if (result.status === "denied")
    return (
      <span className={cn(shell, "text-ink-2")}>
        {icon}
        <span className="truncate">{meta.label}</span>
        {result.permission ? (
          <button
            type="button"
            className="text-accent hover:bg-hover rounded-tau-sm text-tau-meta shrink-0 px-1"
            disabled={requesting}
            onClick={() => void request(result.permission!)}
          >
            允许访问
          </button>
        ) : (
          <span className="text-ink-3 text-tau-meta shrink-0">未获准查看</span>
        )}
      </span>
    );
  const title = result.title || `无标题${meta.label}`;
  if (!openable)
    return (
      <span className={cn(shell, "text-ink-1")} title={title}>
        {icon}
        <span className="truncate">{title}</span>
      </span>
    );
  return (
    <button
      type="button"
      className={cn(shell, "text-ink-1 hover:bg-hover rounded-tau-sm px-1 text-left")}
      title={title}
      onClick={open}
    >
      {icon}
      <span className="truncate">{title}</span>
    </button>
  );
}
