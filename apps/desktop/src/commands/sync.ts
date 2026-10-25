import {
  uploadChunkedPath,
  downloadChunkedPath,
  chunkDigest,
  copySyncFile,
} from "@/services/chunkedSync";
import {
  databaseSyncObjects,
  decodeSessionList,
  encodeDatabaseSyncVersion,
  encodeSessionList,
  localDatabaseVersion,
  readDatabaseSyncVersion,
  type DatabaseSyncVersion,
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
  piSessionInstallDownload,
} from "@/commands/piSession";
import type { ISyncProvider } from "@/types/sync";

interface SyncCommandOptions {
  onProgress?: (payload: { value: number; status: string }) => void;
}

interface UploadOptions extends SyncCommandOptions {
  /** 自动上传无人确认，云端比本机新时跳过，避免覆盖其他设备的修改。 */
  skipWhenRemoteNewer?: boolean;
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

const setLocalVersion = (databaseName: string, version: number) =>
  useSettingStore.setState(
    produce(useSettingStore.getState(), draft => {
      const database = draft.setting.database.databases.find(item => item.name === databaseName);
      if (database) database.version = version;
    })
  );

const withSyncProvider = async (run: (provider: ISyncProvider) => Promise<boolean>) => {
  const syncProvider = SyncProviderFactory.getSyncProvider();
  if (!syncProvider) {
    toast.error("请先配置同步设置");
    return false;
  }
  try {
    return await run(syncProvider);
  } finally {
    await syncProvider.dispose?.();
  }
};

/** 把本机库文件（及桌面对话记录）覆盖到云端固定位置，版本号最后写入。 */
export const upload = (options?: UploadOptions) =>
  withSyncProvider(provider => uploadWithProvider(provider, options));

const uploadWithProvider = async (syncProvider: ISyncProvider, options?: UploadOptions) => {
  const { active: databaseName, databases } = useSettingStore.getState().setting.database;
  const database = databases.find(item => item.name === databaseName);
  if (!database) return false;
  const databasePath = await getDatabasePath(databaseName);
  if (!databasePath) {
    toast.error("请先设置数据库目录");
    return false;
  }

  emitProgress(options, 5, "正在准备同步...");
  const objects = await databaseSyncObjects(databaseName, chunkDigest);
  const remote = await readDatabaseSyncVersion(syncProvider, objects.version);
  if (options?.skipWhenRemoteNewer && remote.version > localDatabaseVersion(database)) {
    toast.warning(`云端 v${remote.version} 比本机新，已跳过自动上传`);
    return false;
  }

  const locked = await piSessionLockLibrary(databaseName);
  if (!locked.ok) {
    toast.error(locked.error ?? "数据库会话锁定失败");
    return false;
  }
  try {
    setDatabaseConnectionStatus(databaseName, "reconnecting");
    // 关库会把编辑器缓存写回并合并 WAL，上传的才是完整的库文件
    await closeDatabase(databaseName);

    emitProgress(options, 30, "正在上传数据库文件...");
    await uploadChunkedPath(syncProvider, objects.database, databasePath, databaseName);

    emitProgress(options, 60, "正在上传对话记录...");
    const prepared = await piSessionSyncFiles(databaseName);
    if (!prepared.ok || !prepared.files) throw new Error(prepared.error ?? "读取对话记录失败");
    for (const file of prepared.files)
      await uploadChunkedPath(syncProvider, objects.session(file.name), file.path, file.name);
    const names = prepared.files.map(file => file.name);
    if (!(await syncProvider.uploadFile(objects.sessions, encodeSessionList(names))))
      throw new Error("对话记录清单上传失败");

    emitProgress(options, 85, "正在上传版本信息...");
    const version = Math.max(localDatabaseVersion(database), remote.version) + 1;
    if (!(await syncProvider.uploadFile(objects.version, encodeDatabaseSyncVersion(version))))
      throw new Error("版本信息上传失败");
    setLocalVersion(databaseName, version);

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

/** 下载云端库文件覆盖本机，覆盖前把旧库复制进 backup/。 */
export const download = (options?: SyncCommandOptions) =>
  withSyncProvider(provider => downloadWithProvider(provider, options));

const downloadWithProvider = async (syncProvider: ISyncProvider, options?: SyncCommandOptions) => {
  const { active: databaseName, databases } = useSettingStore.getState().setting.database;
  if (!databases.some(item => item.name === databaseName)) return false;
  const databasePath = await getDatabasePath(databaseName);
  if (!databasePath) {
    toast.error("请先设置数据库目录");
    return false;
  }

  emitProgress(options, 5, "正在检查云端版本...");
  const objects = await databaseSyncObjects(databaseName, chunkDigest);
  const remote = await readDatabaseSyncVersion(syncProvider, objects.version);
  if (remote.version === 0) {
    toast.error("云端还没有这个数据库，请先在另一台设备上传");
    return false;
  }

  const locked = await piSessionLockLibrary(databaseName);
  if (!locked.ok) {
    toast.error(locked.error ?? "数据库会话锁定失败");
    return false;
  }
  try {
    setDatabaseConnectionStatus(databaseName, "reconnecting");
    await closeDatabase(databaseName);

    emitProgress(options, 20, "正在备份本地数据库...");
    const sep = await getSep();
    const backupDir = databasePath.split(sep).slice(0, -1).concat("backup").join(sep);
    if (!(await pathExists(backupDir))) await createDir(backupDir);
    await copySyncFile(
      databasePath,
      `${backupDir}${sep}version-${localDatabaseVersion(databases.find(item => item.name === databaseName))}-${dayjs().format("YYYY-MM-DD-HH-mm-ss")}-${databaseName}`
    );

    const downloadPath = `${databasePath}.download.tmp`;
    const sessionDirectory = `${databasePath}.sessions.download`;
    try {
      emitProgress(options, 40, "正在下载云端数据库文件...");
      await downloadChunkedPath(syncProvider, objects.database, downloadPath);

      const hasSessions = await syncProvider.fileExists(objects.sessions);
      if (hasSessions) {
        emitProgress(options, 65, "正在下载对话记录...");
        await removeFile(sessionDirectory).catch(() => undefined);
        await createDir(sessionDirectory);
        for (const name of decodeSessionList(await syncProvider.downloadFile(objects.sessions)))
          await downloadChunkedPath(
            syncProvider,
            objects.session(name),
            `${sessionDirectory}${sep}${name}`
          );
      }

      emitProgress(options, 85, "正在替换本地数据库...");
      const installed = await piSessionInstallDownload(databaseName, hasSessions);
      if (!installed.ok) throw new Error(installed.error ?? "替换本地数据库失败");
      // 主库已整体替换，本地索引的 ID 空间失效，重置后按需全量重建
      await invoke("reset-content-index", databaseName);
    } finally {
      await removeFile(downloadPath).catch(() => undefined);
      await removeFile(sessionDirectory).catch(() => undefined);
    }

    setLocalVersion(databaseName, remote.version);
    emitProgress(options, 100, "下载完成");
    return true;
  } catch (e) {
    toast.error("下载数据库失败: " + e);
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

/** 读取当前库的云端版本，云端没有时为 0。 */
export const getRemoteDatabaseVersion = async (): Promise<DatabaseSyncVersion> => {
  const syncProvider = SyncProviderFactory.getSyncProvider();
  if (!syncProvider) return { version: 0 };
  const { active: databaseName } = useSettingStore.getState().setting.database;
  try {
    const objects = await databaseSyncObjects(databaseName, chunkDigest);
    return await readDatabaseSyncVersion(syncProvider, objects.version);
  } finally {
    await syncProvider.dispose?.();
  }
};
