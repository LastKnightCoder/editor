import { assertCompatibleDataModel } from "./model-version";

/** 同步信封版本；数据库内部的 schema 版本不变。旧端会在下载前拒绝新快照。 */
export const SYNC_MODEL_VERSION = 2;

export function assertCompatibleSync(info: {
  dataModelVersion?: unknown;
  databaseObject?: unknown;
  sessionsObject?: unknown;
}) {
  if (info.dataModelVersion === SYNC_MODEL_VERSION) {
    if (typeof info.databaseObject !== "string" || !info.databaseObject)
      throw new Error("同步快照缺少数据库对象名");
    if (info.sessionsObject !== undefined && typeof info.sessionsObject !== "string")
      throw new Error("同步快照的会话对象名无效");
    return;
  }
  assertCompatibleDataModel(info);
}
