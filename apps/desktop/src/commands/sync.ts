import {
  uploadChunkedPath,
  downloadChunkedPath,
  chunkDigest,
  copySyncFile,
} from "@/services/chunkedSync";
import {
  snapshotObject,
  databaseVersionObject,
  decodeSessionDirectory,
  MANIFEST_BYTES,
} from "@tau/db-schema/sync-protocol";
import { toast } from "@tau/ui";
import { produce } from "immer";
import dayjs from "dayjs";

import { invoke } from "@/electron";
import {
  connectDatabaseByName,
  type DatabaseConnectSource,
  reconnectDatabaseFast,
  createDir,
  pathExists,
  getSep,
  closeDatabase,
  removeFile,
} from "@/commands";

import useSettingStore from "@/stores/useSettingStore.ts";
import useGlobalStateStore, { DatabaseConnectionStatus } from "@/stores/useGlobalStateStore";
import { SyncProviderFactory } from "@/utils/sync";
import {
  piSessionSyncFiles,
  piSessionLockLibrary,
  piSessionUnlockLibrary,
  piSessionAssertLibrary,
  piSessionInstallDownload,
} from "@/commands/piSession";
import type { IDatabaseInfo, ISyncProvider } from "@/types/sync";
import {
  SYNC_MODEL_VERSION,
  localSyncVersion,
  assertCompatibleSync,
  readSnapshotHead,
  publishSnapshot,
} from "@tau/db-schema/sync-protocol";

interface SyncCommandOptions {
  onProgress?: (payload: { value: number; status: string }) => void;
}

const emitProgress = (options: SyncCommandOptions | undefined, value: number, status: string) => {
  options?.onProgress?.({ value, status });
};

const setDatabaseConnectionStatus = (databaseName: string, status: DatabaseConnectionStatus) => {
  useGlobalStateStore.setState(state => ({
    databaseStatus: {
      ...state.databaseStatus,
      [databaseName]: status,
    },
  }));
};

const reconnectAfterSync = async (
  databaseName: string,
  source: DatabaseConnectSource,
  options?: { mode?: "fast" | "maintenance" }
) => {
  if (options?.mode === "maintenance") {
    await connectDatabaseByName(databaseName, {
      force: true,
      mode: "maintenance",
      source,
    });
    setDatabaseConnectionStatus(databaseName, "ready");
    return;
  }

  try {
    await reconnectDatabaseFast(databaseName, source);
    setDatabaseConnectionStatus(databaseName, "ready");
  } catch (error) {
    console.error("快速重连失败，回退到维护重连:", error);
    try {
      await connectDatabaseByName(databaseName, {
        force: true,
        mode: "maintenance",
        source,
      });
      setDatabaseConnectionStatus(databaseName, "ready");
    } catch (fallbackError) {
      setDatabaseConnectionStatus(databaseName, "error");
      throw fallbackError;
    }
  }
};

export const getDatabasePath = async (databaseName: string): Promise<string> => {
  try {
    return await invoke("get-database-path", databaseName);
  } catch (e) {
    return "";
  }
};

export const upload = async (options?: SyncCommandOptions) => {
  const syncProvider = SyncProviderFactory.getSyncProvider();
  if (!syncProvider) {
    toast.error("请先配置同步设置");
    return false;
  }
  try {
    return await uploadWithProvider(syncProvider, options);
  } finally {
    await syncProvider.dispose?.();
  }
};

const uploadWithProvider = async (syncProvider: ISyncProvider, options?: SyncCommandOptions) => {
  const { active: databaseName, databases } = useSettingStore.getState().setting.database;

  const database = databases.find(item => item.name === databaseName);
  if (!database) return false;
  const currentVersion = localSyncVersion(database);

  const databasePath = await getDatabasePath(databaseName);

  if (!databasePath) {
    toast.error("请先设置数据库目录");
    return false;
  }

  emitProgress(options, 5, "正在准备同步...");
  const { databaseInfoObjectName, databaseInfo } = await readOriginDatabaseInfo(
    syncProvider,
    databaseName
  );

  const locked = await piSessionLockLibrary(databaseName);
  if (!locked.ok) {
    toast.error(locked.error ?? "数据库会话锁定失败");
    return false;
  }

  setDatabaseConnectionStatus(databaseName, "reconnecting");
  try {
    await closeDatabase(databaseName);
  } catch (error) {
    await piSessionUnlockLibrary(databaseName);
    throw error;
  }
  emitProgress(options, 15, "正在关闭数据库连接...");

  emitProgress(options, 25, "正在校验远程数据库版本...");

  const originVersion = Number(databaseInfo.version || 0);
  if (isNaN(originVersion)) {
    toast.error("远程数据库信息版本号不是一个数字");
    await reconnectAfterSync(databaseName, "sync_upload_reconnect");
    await piSessionUnlockLibrary(databaseName);
    return false;
  }
  if (originVersion > currentVersion) {
    toast.error("远程的数据库版本高于本地版本，请先同步远程数据库");
    await reconnectAfterSync(databaseName, "sync_upload_reconnect");
    await piSessionUnlockLibrary(databaseName);
    return false;
  }

  const newDatabaseInfo: IDatabaseInfo = {
    ...databaseInfo,
    version: currentVersion + 1,
    dataModelVersion: SYNC_MODEL_VERSION,
    commitId: crypto.randomUUID(),
    parentVersion: originVersion,
    databaseObject: snapshotObject(crypto.randomUUID()),
    sessionsObject: snapshotObject(crypto.randomUUID()),
  };

  try {
    const prepared = await piSessionSyncFiles(databaseName);
    if (!prepared.ok || !prepared.files) throw new Error(prepared.error ?? "读取会话目录失败");

    // 上传数据库文件
    emitProgress(options, 40, "正在上传数据库文件...");
    const dataObjectName = newDatabaseInfo.databaseObject!;
    await uploadChunkedPath(syncProvider, dataObjectName, databasePath, databaseName);

    // 会话包（M4）：对话内容在 pi 会话文件里，目录表随 .db 过去、文件得一起过去，
    // 否则对面「列表同步过去、点开全空」。与 .db 共用同一个版本号
    emitProgress(options, 60, "正在上传对话记录...");
    const sessionManifest = {
      format: "tau-session-directory",
      version: 1,
      files: [] as { name: string; object: string }[],
    };
    for (const file of prepared.files) {
      const object = snapshotObject(crypto.randomUUID());
      await uploadChunkedPath(syncProvider, object, file.path, file.name);
      sessionManifest.files.push({ name: file.name, object });
    }
    const sessionBytes = new TextEncoder().encode(JSON.stringify(sessionManifest));
    if (
      sessionBytes.length > MANIFEST_BYTES ||
      !(await syncProvider.uploadFile(newDatabaseInfo.sessionsObject!, sessionBytes))
    )
      throw new Error("会话清单上传失败");

    // 数据库与会话包都上传成功后再发布新版本，避免失败时远程版本提前生效。
    emitProgress(options, 75, "正在上传版本信息...");
    const lease = await piSessionAssertLibrary(databaseName);
    if (!lease.ok) throw new Error(lease.error ?? "同步锁已失效");
    await publishSnapshot(syncProvider, databaseInfoObjectName, databaseInfo, newDatabaseInfo);

    emitProgress(options, 90, "正在更新本地版本记录...");
    useSettingStore.setState(
      produce(useSettingStore.getState(), draft => {
        const databases = draft.setting.database.databases;
        const index = databases.findIndex(item => item.name === databaseName);
        databases[index].version = currentVersion + 1;
        databases[index].syncFormat = SYNC_MODEL_VERSION;
      })
    );

    emitProgress(options, 100, "同步完成");
    return true;
  } catch (e) {
    toast.error("上传数据库失败: " + e);
    return false;
  } finally {
    try {
      await reconnectAfterSync(databaseName, "sync_upload_reconnect");
    } finally {
      await piSessionUnlockLibrary(databaseName);
    }
  }
};

export const download = async (options?: SyncCommandOptions) => {
  const syncProvider = SyncProviderFactory.getSyncProvider();
  if (!syncProvider) {
    toast.error("请先配置同步设置");
    return false;
  }
  try {
    return await downloadWithProvider(syncProvider, options);
  } finally {
    await syncProvider.dispose?.();
  }
};

const downloadWithProvider = async (syncProvider: ISyncProvider, options?: SyncCommandOptions) => {
  const { active: databaseName, databases } = useSettingStore.getState().setting.database;

  const database = databases.find(item => item.name === databaseName);
  if (!database) return false;
  const currentVersion = localSyncVersion(database);

  const databasePath = await getDatabasePath(databaseName);

  const walFilePath = `${databasePath}-wal`;
  const shmFilePath = `${databasePath}-shm`;
  if (!databasePath) {
    toast.error("请先设置数据库目录");
    return false;
  }

  emitProgress(options, 5, "正在检查远程版本...");

  const { databaseInfo } = await readOriginDatabaseInfo(syncProvider, databaseName);
  if (databaseInfo.version === 0) {
    toast.error("远端尚未发布同步快照");
    return false;
  }
  assertCompatibleSync(databaseInfo);

  const originVersion = Number(databaseInfo.version || 0);
  if (currentVersion > originVersion) {
    toast.error("本地的数据库版本高于远程版本，请先同步本地数据库");
    return false;
  }

  // 下载数据库文件
  const dataObjectName = databaseInfo.databaseObject ?? databaseName;
  const locked = await piSessionLockLibrary(databaseName);
  if (!locked.ok) {
    toast.error(locked.error ?? "数据库会话锁定失败");
    return false;
  }
  try {
    setDatabaseConnectionStatus(databaseName, "reconnecting");
    await closeDatabase(databaseName);
    emitProgress(options, 20, "正在关闭数据库连接...");

    const sep = await getSep();
    // 在覆盖本地文件之前，先备份一下，加上时间
    const backupDir = databasePath.split(sep).slice(0, -1).concat("backup").join(sep);
    if (!(await pathExists(backupDir))) {
      await createDir(backupDir);
    }

    const backupPath = String.raw`${backupDir}${sep}version-${originVersion}-${dayjs().format("YYYY-MM-DD-hh-mm-ss")}-${databaseName}`;

    try {
      await copySyncFile(databasePath, backupPath);
      emitProgress(options, 40, "正在备份本地数据库...");
    } catch (e) {
      toast.warning("备份数据库文件失败，停止下载");
      console.error(e);
      return false;
    }

    try {
      if (await pathExists(walFilePath)) {
        await removeFile(walFilePath);
      }
    } catch (e) {
      console.error(e);
    }

    try {
      if (await pathExists(shmFilePath)) {
        await removeFile(shmFilePath);
      }
    } catch (e) {
      console.error(e);
    }

    let databaseDownloadSuccess = true;
    try {
      emitProgress(options, 60, "正在下载远程数据库文件...");
      const downloadPath = `${databasePath}.download.tmp`;
      try {
        await downloadChunkedPath(syncProvider, dataObjectName, downloadPath);
        await invoke("validate-downloaded-database", databaseName);
        const sessionDirectory = `${databasePath}.sessions.download`;
        await removeFile(sessionDirectory).catch(() => undefined);
        const hasSessions = Boolean(databaseInfo.sessionsObject);
        if (databaseInfo.sessionsObject) {
          const directory = decodeSessionDirectory(
            await syncProvider.downloadFile(databaseInfo.sessionsObject)
          );
          await createDir(sessionDirectory);
          const separator = await getSep();
          for (const file of directory.files)
            await downloadChunkedPath(
              syncProvider,
              file.object,
              `${sessionDirectory}${separator}${file.name}`
            );
        }
        // 主库已被远端内容替换，本地索引的 ID 空间整体失效，重置后按需全量重建。
        await invoke("reset-content-index", databaseName);
        const installed = await piSessionInstallDownload(databaseName, hasSessions);
        if (!installed.ok) throw new Error(installed.error ?? "同步快照提交失败");
      } finally {
        await removeFile(downloadPath).catch(() => undefined);
        await removeFile(`${databasePath}.sessions.download`).catch(() => undefined);
      }
      emitProgress(options, 85, "正在更新本地数据库...");
    } catch (e) {
      databaseDownloadSuccess = false;
      console.error("下载数据库文件失败:", e);
    }

    const isSuccessful = databaseDownloadSuccess;

    if (isSuccessful) {
      useSettingStore.setState(
        produce(useSettingStore.getState(), draft => {
          const databases = draft.setting.database.databases;
          const index = databases.findIndex(item => item.name === databaseName);
          databases[index].version = originVersion;
          databases[index].syncFormat = SYNC_MODEL_VERSION;
        })
      );
      emitProgress(options, 100, "下载完成");
    } else {
      // 尝试恢复数据库信息，读取备份数据还原
      try {
        await copySyncFile(backupPath, databasePath);
      } catch (e) {
        toast.error("恢复数据库文件失败，当前数据库文件可能存在损坏，可从备份文件夹手动备份");
      }
    }

    if (!isSuccessful) {
      return false;
    }

    return true;
  } catch (e) {
    toast.error("下载数据库文件失败: " + e);
    return false;
  } finally {
    try {
      // 自动同步随后虽会重载窗口，维护升级也必须在释放同步互斥前完成。
      await reconnectAfterSync(databaseName, "sync_download_reconnect", {
        mode: "maintenance",
      });
    } finally {
      await piSessionUnlockLibrary(databaseName);
    }
  }
};

export const getOriginDatabaseInfo = async () => {
  const syncProvider = SyncProviderFactory.getSyncProvider();
  const { active: databaseName } = useSettingStore.getState().setting.database;
  try {
    return await readOriginDatabaseInfo(syncProvider, databaseName);
  } finally {
    await syncProvider?.dispose?.();
  }
};

const readOriginDatabaseInfo = async (syncProvider: ISyncProvider | null, databaseName: string) => {
  const databaseInfoFileName = await databaseVersionObject(databaseName, chunkDigest);
  const databaseInfoObjectName = databaseInfoFileName;

  let databaseInfo: IDatabaseInfo = { version: 0 };
  let isDatabaseInfoExist = false;

  if (syncProvider) {
    try {
      databaseInfo = await readSnapshotHead(syncProvider, databaseInfoObjectName);
      isDatabaseInfoExist = databaseInfo.version > 0 || Boolean(databaseInfo.databaseObject);
    } catch (e) {
      console.error("获取远程数据库信息失败:", e);
      throw e;
    }
  }

  return {
    isDatabaseInfoExist,
    databaseInfo,
    databaseInfoObjectName,
  };
};
