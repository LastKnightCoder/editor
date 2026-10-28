import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MobileDataAdapter } from "../../app/plugins/data";
import { Button } from "@tau/ui";
import { toast } from "../../components/toast";

export function PluginOperations({
  data,
  pluginId,
  database,
}: {
  data: MobileDataAdapter;
  pluginId: string;
  database: string;
}) {
  const client = useQueryClient();
  const key = ["plugin-operations", database, pluginId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => data.operations(pluginId),
    refetchOnWindowFocus: true,
  });
  return (
    <section className="bg-surface flex flex-col gap-3 rounded-2xl p-4">
      <h3 className="text-ink-1 text-sm font-semibold">最近删除（七天内）</h3>
      {query.error && (
        <p role="alert" className="text-ink-3 text-sm">
          {String(query.error)}
        </p>
      )}
      {query.data?.length === 0 && <p className="text-ink-3 text-sm">没有可恢复的删除记录</p>}
      {query.data?.map(operation => (
        <div key={operation.id} className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm">{operation.title || "无标题内容"}</span>
          <Button
            disabled={!!operation.restoredAt || operation.pending}
            onClick={() =>
              void data
                .restore(pluginId, operation.id)
                .then(() => client.invalidateQueries({ queryKey: key }))
                .catch(error => toast.error(String(error)))
            }
          >
            {operation.pending ? "等待确认" : operation.restoredAt ? "已恢复" : "恢复"}
          </Button>
        </div>
      ))}
    </section>
  );
}
