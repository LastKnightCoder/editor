import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@tau/ui";
import { cancelPluginAI, revokePluginAI, runningPluginAI } from "@/commands/plugin-ai";

export function PluginAIActivity({ pluginId }: { pluginId?: string }) {
  const client = useQueryClient();
  const running = useQuery({
    queryKey: ["plugin-ai-running"],
    queryFn: runningPluginAI,
    refetchInterval: 2000,
  });
  const action = useMutation({
    mutationFn: (input: { requestId: string } | { pluginId: string }) =>
      "requestId" in input ? cancelPluginAI(input.requestId) : revokePluginAI(input.pluginId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["plugin-ai-running"] });
      void client.invalidateQueries({ queryKey: ["plugin-ai"] });
    },
  });
  const items = (running.data ?? []).filter(item => !pluginId || item.pluginId === pluginId);
  return (
    <section className="mb-5 flex flex-col gap-2" aria-label="插件 AI 调用控制">
      <div className="flex items-center justify-between gap-2">
        <span className="text-tau-meta text-ink-2">插件运行中请求：{items.length}</span>
        {pluginId && (
          <Button size="sm" disabled={action.isPending} onClick={() => action.mutate({ pluginId })}>
            停止调用并关闭 AI 授权
          </Button>
        )}
      </div>
      {items.map(item => (
        <div key={item.requestId} className="text-tau-meta flex items-center gap-3">
          <span className="flex-1">
            {item.pluginName} / {item.featureName} · {new Date(item.startedAt).toLocaleTimeString()}
          </span>
          <Button
            size="sm"
            disabled={action.isPending}
            onClick={() => action.mutate({ requestId: item.requestId })}
          >
            取消
          </Button>
          <Button
            size="sm"
            disabled={action.isPending}
            onClick={() => action.mutate({ pluginId: item.pluginId })}
          >
            关闭此插件 AI
          </Button>
        </div>
      ))}
      {(running.error || action.error) && (
        <p role="alert">{(running.error ?? action.error)?.message}</p>
      )}
    </section>
  );
}
