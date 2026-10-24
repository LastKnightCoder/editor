import storageProtocol from "../storage-protocol.json";
export const SYNC_MODEL_VERSION = storageProtocol.modelVersion;
interface SyncMetadata {
  version?: unknown;
  dataModelVersion?: unknown;
  databaseObject?: unknown;
  sessionsObject?: unknown;
}
export const isSnapshotObject = (value: unknown): value is string =>
  typeof value === "string" &&
  value.startsWith(`${storageProtocol.namespace}/snapshots/`) &&
  /^[a-zA-Z0-9-]+\.json$/.test(value.slice(`${storageProtocol.namespace}/snapshots/`.length));
export function assertReadableSyncMetadata(info: SyncMetadata) {
  if (
    info.version === 0 &&
    info.dataModelVersion === undefined &&
    info.databaseObject === undefined &&
    info.sessionsObject === undefined
  )
    return;
  if (info.dataModelVersion !== SYNC_MODEL_VERSION)
    throw new Error("DB_MODEL_INCOMPATIBLE: 同步格式不受支持，请从当前客户端重新发布完整快照");
  if (
    !isSnapshotObject(info.databaseObject) ||
    (info.sessionsObject !== undefined && !isSnapshotObject(info.sessionsObject))
  )
    throw new Error("同步快照文件清单地址无效");
}
export function assertCompatibleSync(info: SyncMetadata) {
  if (info.dataModelVersion !== SYNC_MODEL_VERSION)
    throw new Error("DB_MODEL_INCOMPATIBLE: 同步格式不受支持");
  assertReadableSyncMetadata(info);
}
export function localSyncVersion(
  database: { version?: unknown; syncFormat?: unknown } | undefined
): number {
  return database?.syncFormat === SYNC_MODEL_VERSION &&
    typeof database.version === "number" &&
    Number.isSafeInteger(database.version) &&
    database.version >= 0
    ? database.version
    : 0;
}
