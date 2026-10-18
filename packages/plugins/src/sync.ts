import type { JsonValue } from "./json";
import { assertLocalId } from "./ids";

export interface SyncTransferOptions {
  signal: AbortSignal;
  onProgress?: (progress: { transferred: number; total?: number }) => void;
}
export interface SyncObjectInfo {
  key: string;
  size: number;
  modifiedAt?: number;
}
export interface SyncObjectSource {
  size: number;
  open(): ReadableStream<Uint8Array>;
}
export interface SyncStorageConnection {
  target: { identity: string; label: string };
  stat(key: string, options: SyncTransferOptions): Promise<SyncObjectInfo | null>;
  read(
    key: string,
    options: SyncTransferOptions
  ): Promise<{ info: SyncObjectInfo; body: ReadableStream<Uint8Array> } | null>;
  write(
    key: string,
    source: SyncObjectSource,
    options: SyncTransferOptions & { mode: "replace" | "create-only" }
  ): Promise<{ status: "written" | "already-exists" }>;
  list(
    prefix: string,
    options: SyncTransferOptions & { cursor?: string; limit: number }
  ): Promise<{ items: SyncObjectInfo[]; nextCursor: string | null }>;
  remove(key: string, options: SyncTransferOptions): Promise<void>;
  dispose(): Promise<void>;
}
export type SyncStorageErrorCode =
  | "unauthorized"
  | "forbidden"
  | "rate-limited"
  | "unavailable"
  | "unsupported"
  | "cancelled"
  | "invalid-config";
export class SyncStorageError extends Error {
  constructor(
    readonly code: SyncStorageErrorCode,
    message: string,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "SyncStorageError";
  }
}
export interface SyncStorageDefinition {
  id: string;
  name: string;
  open(config: JsonValue, options: { signal: AbortSignal }): Promise<SyncStorageConnection>;
}
export function defineSyncStorage(
  definition: SyncStorageDefinition
): Readonly<SyncStorageDefinition> {
  assertLocalId(definition.id);
  if (!definition.name.trim() || typeof definition.open !== "function")
    throw new Error("同步提供方声明无效");
  return Object.freeze(definition);
}
