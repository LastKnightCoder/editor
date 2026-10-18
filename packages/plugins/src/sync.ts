import type { JsonValue } from "./json";
export type { JsonValue } from "./json";
import { assertLocalId } from "./ids";
import type { Disposable } from "./contract";

export interface PluginSync {
  register(definition: SyncProviderDefinition): Disposable;
}

export interface RemoteFileInfo {
  name: string;
  path: string;
  size: number;
  lastModified?: number;
  hash?: string;
}

/** 与现有同步消费者保持相同的字节接口和返回语义。 */
export interface SyncProvider {
  uploadFile(objectName: string, content: Uint8Array): Promise<boolean>;
  downloadFile(objectName: string): Promise<Uint8Array>;
  fileExists(objectName: string): Promise<boolean>;
  listFiles(prefix?: string): Promise<RemoteFileInfo[]>;
  createFileIfAbsent(objectName: string, content: Uint8Array): Promise<boolean>;
}

export interface SyncProviderDefinition {
  id: string;
  name: string;
  create(config: JsonValue): SyncProvider;
}

export function defineSyncProvider(
  definition: SyncProviderDefinition
): Readonly<SyncProviderDefinition> {
  assertLocalId(definition.id);
  if (!definition.name.trim() || typeof definition.create !== "function")
    throw new Error("同步提供方声明无效");
  return Object.freeze(definition);
}
