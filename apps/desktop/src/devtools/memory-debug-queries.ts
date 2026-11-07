import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { assistantMemoryRequest } from "@/commands/assistant-memory";
import { on, off } from "@/electron";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { bindDatabaseCommands, currentCommandScope } from "@/services/command-context";
import useSettingStore from "@/stores/useSettingStore";
import type {
  MemoryDebugDetail,
  MemoryDebugPush,
  MemoryDebugSnapshot,
} from "@/types/assistant-memory-debug";
import { newerMemorySnapshot, startMemoryDebugStream } from "./memory-debug-live";

export type MemoryDebugSelection = { id: number; layer: "episode" | "state" | "profile" } | null;
const id = () => globalThis.crypto.randomUUID();

export function useMemoryDebug(open: boolean, selection: MemoryDebugSelection) {
  const database = useSettingStore(state => state.setting.database.active);
  const connected = useDatabaseConnected();
  const scope = currentCommandScope();
  const connectionId =
    scope?.databaseName?.replace(/\.db$/i, "") === database.replace(/\.db$/i, "")
      ? (scope.connectionId ?? "")
      : "";
  const ready = connected && !!connectionId;
  const [reconnect, setReconnect] = useState(0);
  const [streamError, setStreamError] = useState<{ session: string; message: string } | null>(null);
  const [liveSession, setLiveSession] = useState<string | null>(null);
  // 面板开合或连接恢复时换代，旧请求只能写回旧缓存。
  const session = useMemo(
    () => [database, connectionId, open, ready, reconnect, id()].join(":"),
    [open, ready, database, connectionId, reconnect]
  );
  const key = useMemo(
    () => ["devtools", "assistant-memory", database, connectionId, session] as const,
    [database, connectionId, session]
  );
  const client = useQueryClient();
  const commands = useMemo(
    () =>
      bindDatabaseCommands({ assistantMemoryRequest }, { databaseName: database, connectionId }),
    [database, connectionId]
  );
  const snapshot = useQuery({
    queryKey: key,
    enabled: open && ready,
    staleTime: Infinity,
    gcTime: 30_000,
    refetchOnWindowFocus: "always",
    queryFn: async ({ signal }) => {
      const received = await commands.assistantMemoryRequest<MemoryDebugSnapshot>("debug-snapshot");
      signal.throwIfAborted();
      if (received.connectionId !== connectionId) throw new Error("资料库连接已变化");
      return newerMemorySnapshot(client.getQueryData(key), received);
    },
  });
  const detail = useQuery({
    queryKey: [...key, "detail", selection?.layer, selection?.id, snapshot.data?.contentRevision],
    enabled: open && ready && !!snapshot.data && selection !== null,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: "always",
    queryFn: async ({ signal }) => {
      if (!selection) throw new Error("未选择记忆条目");
      const received = await commands.assistantMemoryRequest<MemoryDebugDetail>(
        "debug-detail",
        selection.id,
        selection.layer
      );
      signal.throwIfAborted();
      return received;
    },
  });
  useEffect(() => {
    if (!open || !ready || !snapshot.isSuccess) return;
    return startMemoryDebugStream({
      databaseName: database,
      connectionId,
      subscriptionId: id(),
      listen: receive => {
        const listener = (_event: unknown, push: MemoryDebugPush) => receive(push);
        on("assistant-memory:debug-update", listener);
        return () => off("assistant-memory:debug-update", listener);
      },
      subscribe: subscriptionId =>
        commands.assistantMemoryRequest("debug-subscribe", subscriptionId),
      unsubscribe: subscriptionId =>
        commands.assistantMemoryRequest("debug-unsubscribe", subscriptionId),
      receive: incoming => {
        setLiveSession(session);
        setStreamError(null);
        const current = client.getQueryData<MemoryDebugSnapshot>(key);
        client.setQueryData(key, newerMemorySnapshot(current, incoming));
      },
      closed: () => {
        setLiveSession(null);
        setReconnect(value => value + 1);
      },
      failed: error => {
        setLiveSession(null);
        setStreamError({
          session,
          message: error instanceof Error ? error.message : "推送连接失败",
        });
      },
    });
  }, [open, ready, snapshot.isSuccess, database, connectionId, commands, client, key, session]);
  return {
    database,
    connected: ready,
    snapshot,
    detail,
    live: liveSession === session,
    streamError: streamError?.session === session ? streamError.message : null,
  };
}
