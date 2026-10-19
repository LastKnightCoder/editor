import type { Disposable, JsonValue } from "./contract";

export interface PublishTarget {
  /** 物理目标的稳定身份，不包含凭据、插件或模板版本。 */
  identity: string;
  basePath: string;
  publicUrl?: string;
}

export interface PublicationSnapshot {
  /** 宿主为本轮文件计划颁发的临时句柄，不能读取任意本地文件。 */
  id: string;
  files: readonly { path: string; hash: string }[];
  deletions: readonly string[];
}

interface PublishInstanceBase {
  describe(signal: AbortSignal): Promise<PublishTarget>;
  checkConnection(signal: AbortSignal): Promise<boolean>;
  dispose?(): void | Promise<void>;
}
export interface FilePublishInstance extends PublishInstanceBase {
  mode: "files";
  concurrency?: number;
  uploadFile(path: string, content: Uint8Array, signal: AbortSignal): Promise<void>;
  deleteFile(path: string, signal: AbortSignal): Promise<void>;
}
export interface SnapshotPublishInstance extends PublishInstanceBase {
  mode: "snapshot";
  publish(snapshot: PublicationSnapshot, signal: AbortSignal): Promise<void>;
}
export type PublishInstance = FilePublishInstance | SnapshotPublishInstance;
export interface PublishProviderDefinition {
  id: string;
  name: string;
  create(config: JsonValue): PublishInstance;
}
export interface PluginPublish {
  register(definition: PublishProviderDefinition): Disposable;
}

export interface GitSnapshotRequest {
  publicationId: string;
  remote: string;
  branch: string;
  author: { name: string; email: string };
  authentication: { username: string; password: string };
  cacheId?: string;
}
export interface GitCacheDirectory {
  id: string;
  label: string;
}
