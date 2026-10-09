/** 同步信封版本；数据库内部的 schema 版本不变。旧端会在下载前拒绝新快照。 */
export const SYNC_MODEL_VERSION = 4;

interface SyncMetadata {
  dataModelVersion?: unknown;
  databaseObject?: unknown;
  sessionsObject?: unknown;
}

/** 旧元信息仅用于探测版本与衔接上传，不代表允许下载旧数据库。 */
export function assertReadableSyncMetadata(info: SyncMetadata) {
  const version = info.dataModelVersion === undefined ? 0 : info.dataModelVersion;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    version > SYNC_MODEL_VERSION
  ) {
    throw new Error("DB_MODEL_INCOMPATIBLE: 远端同步协议不受支持，请升级客户端");
  }
  if (version >= 2) {
    if (typeof info.databaseObject !== "string" || !info.databaseObject)
      throw new Error("同步快照缺少数据库对象名");
    if (info.sessionsObject !== undefined && typeof info.sessionsObject !== "string")
      throw new Error("同步快照的会话对象名无效");
  }
}

export function assertCompatibleSync(info: SyncMetadata) {
  if (info.dataModelVersion !== SYNC_MODEL_VERSION) {
    throw new Error(
      "DB_MODEL_INCOMPATIBLE: 远端快照协议与当前客户端不一致，请在已升级且数据完整的客户端上传新快照"
    );
  }
  assertReadableSyncMetadata(info);
}
