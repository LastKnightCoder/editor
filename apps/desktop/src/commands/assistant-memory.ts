import { invoke } from "@/electron";
import { currentCommandScope } from "@/services/command-context";
import { withModule } from "./module-init";

export type AssistantMemoryChannel =
  | "status"
  | "search"
  | "get"
  | "recall"
  | "recall-get"
  | "correct"
  | "forget"
  | "retry";

export function assistantMemoryRequest<T>(channel: AssistantMemoryChannel, ...args: unknown[]) {
  const scope = currentCommandScope();
  if (!scope?.databaseName || !scope.connectionId)
    return Promise.reject(new Error("资料库尚未连接"));
  const { databaseName, connectionId, signal } = scope;
  return withModule("assistant-memory", () => {
    signal?.throwIfAborted();
    return invoke<T>("assistant-memory:" + channel, ...args, { databaseName, connectionId });
  });
}
