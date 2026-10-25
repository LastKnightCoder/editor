import type { Digest, ObjectStorage } from "./chunked-storage";
import { assertFileName, STORAGE_PROTOCOL } from "./chunked-storage";

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

/** 对话记录清单：会话目录下的文件名列表，每个文件按名存放在 sessions/ 下。 */
export const encodeSessionList = (files: string[]) =>
  new TextEncoder().encode(JSON.stringify({ files }));

export function decodeSessionList(bytes: Uint8Array): string[] {
  const value = JSON.parse(new TextDecoder().decode(bytes));
  const files: unknown[] = Array.isArray(value?.files) ? value.files : [];
  for (const file of files) assertFileName(file);
  return files as string[];
}

export function localDatabaseVersion(database: { version?: unknown } | undefined): number {
  const version = database?.version;
  return typeof version === "number" && Number.isSafeInteger(version) && version > 0 ? version : 0;
}
