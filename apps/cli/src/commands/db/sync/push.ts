import { readFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { SYNC_MODEL_VERSION, packSessionDir, validateSessionReferences } from "@tau/db-schema/sync";
import { DataAccess } from "../../../data-access/index.js";
import { getActiveDatabase } from "../../../utils/settings.js";
import { createSyncProvider, type IDatabaseInfo } from "../../../utils/sync-providers/factory.js";
import { readRemoteInfo, withSyncDatabase, openSnapshotDatabase } from "./runtime.js";

export async function runSyncPush() {
  const provider = createSyncProvider();
  if (!provider) throw new Error("请先在桌面端配置同步服务");
  const database = getActiveDatabase();
  await withSyncDatabase(database.name, "push", async context => {
    const remoteInfo = await readRemoteInfo(provider, database.name);
    if (remoteInfo.version > database.version) throw new Error("远端版本高于本地，请先下载");
    const snapshot = `${database.name}.snapshot-${randomUUID()}`;
    const next: IDatabaseInfo = {
      ...remoteInfo,
      version: database.version + 1,
      dataModelVersion: SYNC_MODEL_VERSION,
      databaseObject: `${snapshot}.db`,
      sessionsObject: `${snapshot}.sessions.zip`,
    };
    const snapshotPath = `${context.databasePath}.${randomUUID()}.upload.tmp`;
    try {
      const access = new DataAccess(database.name, {
        databasePath: context.databasePath,
        allowOwnedSync: true,
        migrateIndex: false,
      });
      try {
        access.getDatabase().prepare("VACUUM INTO ?").run(snapshotPath);
      } finally {
        access.close();
      }
      validateSessionReferences(snapshotPath, context.sessionDir, openSnapshotDatabase);
      const archive = packSessionDir(context.sessionDir);
      console.log(`正在上传 ${database.name} 的数据库与对话快照…`);
      if (!(await provider.uploadFile(next.databaseObject!, readFileSync(snapshotPath))))
        throw new Error("数据库上传失败，远端版本未改变");
      if (!(await provider.uploadFile(next.sessionsObject!, archive)))
        throw new Error("对话包上传失败，远端版本未改变");
      if (
        !(await provider.uploadFile(
          `database_${database.name}.json`,
          new TextEncoder().encode(JSON.stringify(next))
        ))
      )
        throw new Error("同步版本发布失败");
      await context.saveVersion(next.version);
      console.log(`同步完成：${database.version} → ${next.version}`);
    } finally {
      rmSync(snapshotPath, { force: true });
    }
  });
}
