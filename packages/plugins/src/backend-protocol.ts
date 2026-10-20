import type { JsonValue } from "./json";
import { copyJson } from "./values";

export const BACKEND_SESSION_INVALID = "PLUGIN_BACKEND_SESSION_INVALID:";

export const BACKEND_LIMITS = Object.freeze({
  messageBytes: 1024 * 1024,
  concurrent: 16,
  queue: 128,
  startupMs: 10_000,
  requestMs: 30_000,
  cleanupMs: 3_000,
  idleMs: 60_000,
});
export type BackendRequest =
  | { type: "tool-result"; generation: string; id: string; value: JsonValue }
  | { type: "tool-error"; generation: string; id: string; message: string }
  | { type: "call"; generation: string; id: string; method: string; input: JsonValue }
  | { type: "cancel"; generation: string; id: string }
  | { type: "ping"; generation: string }
  | { type: "stop"; generation: string };
export type BackendReply =
  | { type: "tool-call"; generation: string; id: string; toolId: string; args: string[] }
  | { type: "tool-cancel"; generation: string; id: string }
  | { type: "ready" | "pong" | "stopped"; generation: string }
  | { type: "result"; generation: string; id: string; value: JsonValue }
  | { type: "error"; generation: string; id?: string; message: string }
  | { type: "event"; generation: string; event: string; value: JsonValue };

export function assertBackendName(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-zA-Z][\w.-]{0,127}$/.test(value))
    throw new Error("后台方法或事件名称无效");
}

export function backendJson(value: unknown): JsonValue {
  const result = copyJson(value);
  const visit = (value: JsonValue): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new Error("后台数据包含保留字段");
      visit(item);
    }
  };
  visit(result);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > BACKEND_LIMITS.messageBytes)
    throw new Error("后台消息超过大小限制");
  return result;
}
