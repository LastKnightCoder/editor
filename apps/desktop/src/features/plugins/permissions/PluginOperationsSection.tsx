import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@tau/ui";
import type { DesktopDataAdapter } from "@/app/plugins/data";
import type { PluginOperationRecord } from "@/types/plugin-data";

const ENTITY_NAMES: Record<PluginOperationRecord["entity"], string> = {
  card: "卡片",
  article: "文章",
  todo: "待办",
  event: "日程",
};

const timeLabel = (time: number) =>
  new Date(time).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** 插件详情页「最近删除」：插件 7 天内删除的内容，可逐条恢复 */
export function PluginOperationsSection({
  data,
  pluginId,
}: {
  data: DesktopDataAdapter;
  pluginId: string;
}) {
  const client = useQueryClient();
  const key = ["plugins", "operations", pluginId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => data.operations(pluginId),
    refetchOnWindowFocus: true,
  });
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  if (!query.data?.length) return null;

  const restore = async (operation: PluginOperationRecord) => {
    setBusy(operation.id);
    setError("");
    try {
      await data.restore(operation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "恢复失败");
    } finally {
      setBusy(null);
      await client.invalidateQueries({ queryKey: key });
    }
  };

  return (
    <section aria-label="最近删除" className="mt-6">
      <h3 className="text-tau-body text-ink-1 mb-1 font-semibold">最近删除</h3>
      <p className="text-tau-meta text-ink-3 mb-2">此插件在 7 天内删除的内容，可以恢复。</p>
      {query.data.map(operation => (
        <div
          key={operation.id}
          className="flex items-center gap-3 px-1 py-2.5 shadow-[0_1px_0_var(--tau-line-2)]"
        >
          <span className="text-tau-meta text-ink-3 w-10 shrink-0">
            {ENTITY_NAMES[operation.entity]}
          </span>
          <span className="text-tau-body text-ink-1 min-w-0 flex-1 truncate">
            {operation.title || "（无标题）"}
          </span>
          <span className="text-tau-meta text-ink-3 tabular-nums">
            {timeLabel(operation.createdAt)}
          </span>
          {operation.restoredAt ? (
            <span className="text-tau-meta text-ink-3">已恢复</span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => void restore(operation)}
            >
              恢复
            </Button>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="text-tau-meta text-danger mt-2">
          {error}
        </p>
      )}
    </section>
  );
}
