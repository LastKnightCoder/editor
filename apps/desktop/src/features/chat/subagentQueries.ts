import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getSubagentDetail, listSubagents, onSubagentsChanged } from "@/commands/subagents";
import { onPiSessionEvent } from "@/commands/piSession";
import type { SubagentParentRef } from "@/types/subagent";

const subscriptions = new WeakMap<QueryClient, { count: number; dispose: () => void }>();
function subscribe(client: QueryClient) {
  let entry = subscriptions.get(client);
  if (!entry) {
    entry = {
      count: 0,
      dispose: onSubagentsChanged(() => {
        void client.invalidateQueries({ queryKey: ["subagents"] });
      }),
    };
    subscriptions.set(client, entry);
  }
  entry.count += 1;
  return () => {
    entry.count -= 1;
    if (!entry.count) {
      entry.dispose();
      subscriptions.delete(client);
    }
  };
}

/** 缺省为本窗口活跃父会话的全部子 Agent；指明父对话时连同其持久记录（父宿主已回收也能看） */
export function useSubagents(parent?: SubagentParentRef) {
  const client = useQueryClient();
  useEffect(() => subscribe(client), [client]);
  return useQuery({
    queryKey: ["subagents", "list", parent?.scope ?? null],
    queryFn: () => listSubagents(parent),
    refetchOnWindowFocus: true,
  });
}

export function useSubagentDetail(agentId: string | null, parent?: SubagentParentRef) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["subagents", "detail", agentId],
    queryFn: () => {
      if (!agentId) throw new Error("未选择子 Agent");
      return getSubagentDetail(agentId, parent);
    },
    enabled: Boolean(agentId),
    refetchOnWindowFocus: true,
  });
  const hostId = query.data?.view.hostId;
  useEffect(() => {
    if (!hostId || !agentId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onPiSessionEvent(hostId, () => {
      timer ??= setTimeout(() => {
        timer = undefined;
        void client.invalidateQueries({
          queryKey: ["subagents", "detail", agentId],
        });
      }, 200);
    });
    void client.invalidateQueries({
      queryKey: ["subagents", "detail", agentId],
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [client, agentId, hostId]);
  return query;
}
