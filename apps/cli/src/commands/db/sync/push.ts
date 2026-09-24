import { readFileSync } from "node:fs";
import { DataAccess, closeDataAccess } from "../../../data-access/index.js";
import { DATA_MODEL_VERSION, assertCompatibleDataModel } from "@tau/db-schema/src/model-version";
import { isAppRunning } from "../../../data-access/notify.js";
import { rpcRequest } from "../../../data-access/rpc-client.js";
import { getActiveDatabase, updateDatabaseVersion } from "../../../utils/settings.js";
import { getDbPath } from "../../../utils/path.js";
import { createSyncProvider, type IDatabaseInfo } from "../../../utils/sync-providers/factory.js";

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function runSyncPush() {
  const provider = createSyncProvider();
  if (!provider) {
    throw new Error("Sync not configured. Please configure sync settings in the Tau app.");
  }

  const db = getActiveDatabase();
  const dbPath = getDbPath(db.name);
  const appRunning = await isAppRunning();

  console.log(`Pushing ${db.name} (v${db.version}) via ${provider.getProviderName()}...`);

  // Check remote version
  const infoFileName = `database_${db.name}.json`;
  let remoteInfo: IDatabaseInfo = { version: 0 };

  try {
    const exists = await provider.fileExists(infoFileName);
    if (exists) {
      const content = await provider.downloadFile(infoFileName);
      remoteInfo = JSON.parse(new TextDecoder().decode(content));
    }
  } catch (e: unknown) {
    throw new Error(`Failed to check remote version: ${getErrorMessage(e)}`);
  }

  assertCompatibleDataModel(remoteInfo);
  if (remoteInfo.version > db.version) {
    throw new Error(
      `Remote version (${remoteInfo.version}) is higher than local (${db.version}). Pull first.`
    );
  }

  // If app is running, ask it to close the database connection
  if (appRunning) {
    console.log("Tau app is running, requesting database close...");
    try {
      await rpcRequest("close-database", [db.name], { timeoutMs: 10000 });
    } catch (e: unknown) {
      throw new Error(`Failed to close database in app: ${getErrorMessage(e)}`);
    }
  }

  const newVersion = db.version + 1;
  const newInfo: IDatabaseInfo = {
    ...remoteInfo,
    version: newVersion,
    dataModelVersion: DATA_MODEL_VERSION,
  };

  try {
    // Upload version info
    closeDataAccess();
    const access = new DataAccess(db.name);
    try {
      const checkpoint = access.getDatabase().pragma("wal_checkpoint(TRUNCATE)") as {
        busy: number;
      }[];
      if (checkpoint.some(row => row.busy !== 0))
        throw new Error("数据库仍在使用，无法创建同步快照");
    } finally {
      access.close();
    }
    console.log("Uploading version info...");
    const encoder = new TextEncoder();
    const infoSuccess = await provider.uploadFile(
      infoFileName,
      encoder.encode(JSON.stringify(newInfo))
    );
    if (!infoSuccess) throw new Error("Failed to upload version info");

    // Upload database file
    console.log("Uploading database file...");
    const dbContent = readFileSync(dbPath);
    const dbSuccess = await provider.uploadFile(db.name, new Uint8Array(dbContent));
    if (!dbSuccess) {
      // Rollback version info
      await provider.uploadFile(infoFileName, encoder.encode(JSON.stringify(remoteInfo)));
      throw new Error("Failed to upload database file");
    }

    // Update local version
    updateDatabaseVersion(db.name, newVersion);
    console.log(`Push complete. Version: ${db.version} → ${newVersion}`);
  } catch (e: unknown) {
    // Try to reconnect if app was running
    if (appRunning) {
      try {
        await rpcRequest("reconnect-database-fast", [db.name, "sync_upload_reconnect"], {
          timeoutMs: 10000,
        });
      } catch {
        /* best-effort reconnect */
      }
    }
    throw e;
  }

  // Reconnect database in app if it was running
  if (appRunning) {
    console.log("Reconnecting database in Tau app...");
    try {
      await rpcRequest("reconnect-database-fast", [db.name, "sync_upload_reconnect"], {
        timeoutMs: 10000,
      });
    } catch (e: unknown) {
      console.warn(`Warning: Failed to reconnect database in app: ${getErrorMessage(e)}`);
    }
  }
}
