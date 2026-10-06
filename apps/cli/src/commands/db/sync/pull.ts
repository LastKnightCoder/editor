import { writeFileSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { installSessionDownload, validateDatabaseFile } from "@tau/db-schema/sync";
import { DataAccess } from "../../../data-access/index.js";
import { getActiveDatabase } from "../../../utils/settings.js";
import { createSyncProvider } from "../../../utils/sync-providers/factory.js";
import { getIndexDbPath } from "../../../data-access/index-db.js";
import { readRemoteInfo, withSyncDatabase, openSnapshotDatabase } from "./runtime.js";

export async function runSyncPull() {
  const provider = createSyncProvider();
  if (!provider) throw new Error("请先在桌面端配置同步服务");
  const database = getActiveDatabase();
  await withSyncDatabase(database.name, "pull", async context => {
    const info = await readRemoteInfo(provider, database.name, true);
    if (database.version > info.version) throw new Error("本地版本高于远端，请先上传");
    console.log(`正在下载 ${database.name} 的数据库与对话快照…`);
    const databaseBytes = await provider.downloadFile(info.databaseObject ?? database.name);
    const archiveObject = info.sessionsObject ?? `${database.name}.sessions.zip`;
    const hasArchive = await provider.fileExists(archiveObject);
    if (info.sessionsObject && !hasArchive) throw new Error("远端快照缺少声明的对话包");
    const archive = hasArchive
      ? Buffer.from(await provider.downloadFile(archiveObject))
      : undefined;
    const downloadPath = `${context.databasePath}.download.tmp`;
    try {
      writeFileSync(downloadPath, databaseBytes);
      validateDatabaseFile(downloadPath, openSnapshotDatabase);
      // 只升级下载副本；校验失败不改变本地数据库和索引。
      const candidate = new DataAccess(database.name, {
        databasePath: downloadPath,
      });
      candidate.close();
      const local = new Database(context.databasePath, { fileMustExist: true });
      try {
        const checkpoint = local.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number }>;
        if (checkpoint.some(row => row.busy !== 0)) throw new Error("数据库仍在使用，不能安全替换");
      } finally {
        local.close();
      }
      // 索引可以重建，必须在替换主库前使旧 ID 空间失效。
      const indexPath = getIndexDbPath(database.name);
      for (const suffix of ["", "-wal", "-shm"]) rmSync(`${indexPath}${suffix}`, { force: true });
      context.assertLease();
      installSessionDownload(
        context.databasePath,
        context.sessionDir,
        archive,
        openSnapshotDatabase
      );
      await context.saveVersion(info.version);
      console.log(`同步完成：${database.version} → ${info.version}`);
    } finally {
      for (const suffix of ["", "-wal", "-shm"])
        rmSync(`${downloadPath}${suffix}`, { force: true });
    }
  });
}
