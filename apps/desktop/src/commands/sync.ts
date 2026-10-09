import { toast } from "@tau/ui";
import { produce } from "immer";
import dayjs from "dayjs";

import { invoke } from "@/electron";
import {
  connectDatabaseByName,
  type DatabaseConnectSource,
  reconnectDatabaseFast,
  readBinaryFile,
  writeBinaryFile,
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
  piSessionPack,
  piSessionLockLibrary,
  piSessionUnlockLibrary,
  piSessionAssertLibrary,
  piSessionInstallDownload,
} from "@/commands/piSession";
import type { IDatabaseInfo } from "@/types/sync";
import {
  SYNC_MODEL_VERSION,
  assertCompatibleSync,
  readSnapshotHead,
  publishSnapshot,
} from "@tau/db-schema/sync-protocol";

/** 会话包的远程对象名（与 .db 同名前缀，共用 database_<库名>.json 里的版本号） */
export const sessionArchiveObjectName = (databaseName: string) => `${databaseName}.sessions.zip`;

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

  const { active: databaseName, databases } = useSettingStore.getState().setting.database;

  const database = databases.find(item => item.name === databaseName);
  if (!database) return false;
  const { version: currentVersion } = database;

  const databasePath = await getDatabasePath(databaseName);

  if (!databasePath) {
    toast.error("请先设置数据库目录");
    return false;
  }

  emitProgress(options, 5, "正在准备同步...");
  const { databaseInfoObjectName, databaseInfo } = await getOriginDatabaseInfo();

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
    databaseObject: `${databaseName}.snapshot-${crypto.randomUUID()}.db`,
    sessionsObject: `${databaseName}.snapshot-${crypto.randomUUID()}.sessions.zip`,
  };

  try {
    // 上传数据库文件
    emitProgress(options, 40, "正在上传数据库文件...");
    const contents = await readBinaryFile(databasePath);
    const dataObjectName = newDatabaseInfo.databaseObject!;
    const dataSuccess = await syncProvider.uploadFile(dataObjectName, contents);

    if (!dataSuccess) {
      toast.error("上传数据库文件失败");
      return false;
    }

    // 会话包（M4）：对话内容在 pi 会话文件里，目录表随 .db 过去、文件得一起过去，
    // 否则对面「列表同步过去、点开全空」。与 .db 共用同一个版本号
    emitProgress(options, 60, "正在上传对话记录...");
    const packed = await piSessionPack(databaseName);
    if (!packed.ok || !packed.archive) {
      toast.error(`打包对话记录失败：${packed.error ?? "未知错误"}`);
      return false;
    }
    const sessionsSuccess = await syncProvider.uploadFile(
      newDatabaseInfo.sessionsObject!,
      packed.archive
    );
    if (!sessionsSuccess) {
      toast.error("上传对话记录失败");
      return false;
    }

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

  const { active: databaseName, databases } = useSettingStore.getState().setting.database;

  const database = databases.find(item => item.name === databaseName);
  if (!database) return false;
  const { version: currentVersion } = database;

  const databasePath = await getDatabasePath(databaseName);

  const walFilePath = `${databasePath}-wal`;
  const shmFilePath = `${databasePath}-shm`;
  if (!databasePath) {
    toast.error("请先设置数据库目录");
    return false;
  }

  emitProgress(options, 5, "正在检查远程版本...");

  const { databaseInfo } = await getOriginDatabaseInfo();
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
      const originContents = await readBinaryFile(databasePath);
      await writeBinaryFile(backupPath, originContents);
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
      const contents = await syncProvider.downloadFile(dataObjectName);
      const downloadPath = `${databasePath}.download.tmp`;
      try {
        await writeBinaryFile(downloadPath, contents);
        await invoke("validate-downloaded-database", databaseName);
        const archiveName = databaseInfo.sessionsObject ?? sessionArchiveObjectName(databaseName);
        const hasArchive = await syncProvider.fileExists(archiveName);
        if (databaseInfo.sessionsObject && !hasArchive) throw new Error("同步快照缺少对话记录包");
        const archive = hasArchive ? await syncProvider.downloadFile(archiveName) : undefined;
        // 主库已被远端内容替换，本地索引的 ID 空间整体失效，重置后按需全量重建。
        await invoke("reset-content-index", databaseName);
        const installed = await piSessionInstallDownload(databaseName, archive);
        if (!installed.ok) throw new Error(installed.error ?? "同步快照提交失败");
      } finally {
        await removeFile(downloadPath).catch(() => undefined);
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
        })
      );
      emitProgress(options, 100, "下载完成");
    } else {
      // 尝试恢复数据库信息，读取备份数据还原
      try {
        const dataContent = await readBinaryFile(backupPath);
        await writeBinaryFile(databasePath, dataContent);
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

  const databaseInfoFileName = `database_${databaseName}.json`;
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
