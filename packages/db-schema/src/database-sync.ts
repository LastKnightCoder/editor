import type { ChunkManifest, Digest, ObjectStorage } from "./chunked-storage";
import {
  assertFileName,
  decodeChunkManifest,
  MANIFEST_BYTES,
  STORAGE_PROTOCOL,
} from "./chunked-storage";

/** 云端版本文件：只记录版本号与写入时间，库文件与对话记录写完后最后覆盖。 */
export interface DatabaseSyncVersion {
  version: number;
  updatedAt?: number;
}

/** 每个库在云端的固定位置，上传即按名覆盖。 */
export async function databaseSyncObjects(name: string, digest: Digest) {
  const root = `${STORAGE_PROTOCOL.namespace}/databases/${await digest(new TextEncoder().encode(name))}`;
  return {
    version: `${root}/version.json`,
    database: `${root}/data.db`,
    sessions: `${root}/sessions.json`,
    session: (file: string) => `${root}/sessions/${file}`,
  };
}

/** 云端没有版本文件时视为版本 0（尚未上传）。 */
export async function readDatabaseSyncVersion(
  store: Pick<ObjectStorage, "downloadFile" | "fileExists">,
  object: string
): Promise<DatabaseSyncVersion> {
  if (store.fileExists && !(await store.fileExists(object))) return { version: 0 };
  const value = JSON.parse(new TextDecoder().decode(await store.downloadFile(object)));
  return {
    version: Number.isSafeInteger(value?.version) && value.version > 0 ? value.version : 0,
    updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : undefined,
  };
}

export const encodeDatabaseSyncVersion = (version: number) =>
  new TextEncoder().encode(JSON.stringify({ version, updatedAt: Date.now() }));

/** 完整索引携带分块元信息，避免逐文件请求清单。 */
export function encodeSessionList(files: string[], manifests?: ChunkManifest[]): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify({ files, manifests }));
  if (bytes.length > MANIFEST_BYTES) throw new Error("对话记录索引过大");
  return bytes;
}

function parseSessionList(bytes: Uint8Array) {
  if (bytes.length > MANIFEST_BYTES) throw new Error("对话记录索引过大");
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(value?.files)) throw new Error("对话记录清单缺少文件列表");
  const names = new Set<string>();
  for (const file of value.files) {
    assertFileName(file);
    if (names.has(file)) throw new Error("对话记录清单文件名重复");
    names.add(file);
  }
  return value as { files: string[]; manifests?: unknown };
}

export function decodeSessionList(bytes: Uint8Array): string[] {
  return parseSessionList(bytes).files;
}

export async function decodeSessionIndex(bytes: Uint8Array, digest: Digest) {
  const value = parseSessionList(bytes);
  const manifests = new Map<string, ChunkManifest>();
  if (value.manifests !== undefined) {
    if (!Array.isArray(value.manifests) || value.manifests.length !== value.files.length)
      throw new Error("对话记录索引不完整");
    const names = new Set(value.files);
    for (const item of value.manifests) {
      const manifest = await decodeChunkManifest(
        new TextEncoder().encode(JSON.stringify(item)),
        digest
      );
      if (!names.has(manifest.name) || manifests.has(manifest.name))
        throw new Error("对话记录索引文件名不匹配");
      manifests.set(manifest.name, manifest);
    }
  }
  return { files: value.files, manifests };
}

export function localDatabaseVersion(database: { version?: unknown } | undefined): number {
  const version = database?.version;
  return typeof version === "number" && Number.isSafeInteger(version) && version > 0 ? version : 0;
}
