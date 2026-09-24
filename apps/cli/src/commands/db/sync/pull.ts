import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { DataAccess, closeDataAccess } from "../../../data-access/index.js";
import { assertCompatibleDataModel } from "@tau/db-schema/src/model-version";
import { isAppRunning } from "../../../data-access/notify.js";
import { rpcRequest } from "../../../data-access/rpc-client.js";
import { getActiveDatabase, updateDatabaseVersion } from "../../../utils/settings.js";
import { getDbPath } from "../../../utils/path.js";
import { createSyncProvider, type IDatabaseInfo } from "../../../utils/sync-providers/factory.js";
import { getIndexDbPath } from "../../../data-access/index-db.js";

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function runSyncPull() {
  const provider = createSyncProvider();
  if (!provider) {
    throw new Error("Sync not configured. Please configure sync settings in the Tau app.");
  }

  const db = getActiveDatabase();
  const dbPath = getDbPath(db.name);
  const appRunning = await isAppRunning();

  console.log(`Pulling ${db.name} (local v${db.version}) via ${provider.getProviderName()}...`);

  // Check remote version
  const infoFileName = `database_${db.name}.json`;
  let remoteInfo: IDatabaseInfo = { version: 0 };

  try {
    const exists = await provider.fileExists(infoFileName);
    if (!exists) {
      throw new Error("No remote database found.");
    }
    const content = await provider.downloadFile(infoFileName);
    remoteInfo = JSON.parse(new TextDecoder().decode(content));
  } catch (e: unknown) {
    throw new Error(`Failed to check remote version: ${getErrorMessage(e)}`);
  }

  assertCompatibleDataModel(remoteInfo);
  if (db.version > remoteInfo.version) {
    throw new Error(
      `Local version (${db.version}) is higher than remote (${remoteInfo.version}). Push first.`
    );
  }

  if (db.version === remoteInfo.version) {
    console.log("Already up to date.");
    return;
  }

  // If app is running, close database connection
  if (appRunning) {
    console.log("Tau app is running, requesting database close...");
    try {
      await rpcRequest("close-database", [db.name], { timeoutMs: 10000 });
    } catch (e: unknown) {
      throw new Error(`Failed to close database in app: ${getErrorMessage(e)}`);
    }
  }

  // Backup local database
  closeDataAccess();
  const backupDir = join(dirname(dbPath), "backup");
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = join(backupDir, `v${db.version}-${timestamp}-${db.name}`);

  try {
    console.log("Backing up local database...");
    const localContent = readFileSync(dbPath);
    writeFileSync(backupPath, localContent);
  } catch (e: unknown) {
    if (appRunning) {
      try {
        await rpcRequest("reconnect-database-fast", [db.name, "sync_download_reconnect"], {
          timeoutMs: 10000,
        });
      } catch {
        /* best-effort */
      }
    }
    throw new Error(`Failed to backup: ${getErrorMessage(e)}`);
  }

  try {
    // Remove WAL/SHM files
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    if (existsSync(walPath)) unlinkSync(walPath);
    if (existsSync(shmPath)) unlinkSync(shmPath);
    // 主库即将被远端内容替换，本地索引的 ID 空间整体失效，删除后由桌面端按需全量重建。
    const indexPath = getIndexDbPath(db.name);
    if (existsSync(indexPath)) unlinkSync(indexPath);

    // Download remote database
    console.log("Downloading remote database...");
    const remoteContent = await provider.downloadFile(db.name);
    writeFileSync(dbPath, Buffer.from(remoteContent));
    // pull 已将原库备份到 backupPath、远端文件也可重新下载，迁移无需再留全量快照
    const migrated = new DataAccess(db.name, { skipMigrationBackup: true });
    migrated.close();

    // Update local version
    updateDatabaseVersion(db.name, remoteInfo.version);
    console.log(`Pull complete. Version: ${db.version} → ${remoteInfo.version}`);
  } catch (e: unknown) {
    // Restore from backup
    try {
      const backupContent = readFileSync(backupPath);
      writeFileSync(dbPath, backupContent);
      console.log("Restored from backup.");
    } catch {
      /* backup restore failed */
    }
    if (appRunning) {
      try {
        await rpcRequest("reconnect-database-fast", [db.name, "sync_download_reconnect"], {
          timeoutMs: 10000,
        });
      } catch {
        /* best-effort */
      }
    }
    throw e;
  }

  // Reconnect database in app
  if (appRunning) {
    console.log("Reconnecting database in Tau app...");
    try {
      await rpcRequest("reconnect-database-fast", [db.name, "sync_download_reconnect"], {
        timeoutMs: 10000,
      });
    } catch (e: unknown) {
      console.warn(`Warning: Failed to reconnect database in app: ${getErrorMessage(e)}`);
    }
  }
}
