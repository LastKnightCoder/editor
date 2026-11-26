import { desktopI18n } from "@/app/i18n/runtime";
import { syncCommandTranslator, SyncCommandError, syncCommandErrorText } from "./sync.i18n";
import type { DatabaseSyncProgress, DatabaseSyncStatus } from "@tau/shared/sync-progress";
import { queryClient } from "@/queryClient";
import { isCurrentDatabaseQuery } from "@/services/command-context";
import {
  uploadChunkedPath,
  downloadChunkedPath,
  chunkDigest,
  copySyncFile,
  syncFileSize,
} from "@/services/chunkedSync";
import { readSessionUploadCache, writeSessionUploadCache } from "@/services/sessionUploadCache";
import { withSyncRequestRetry } from "@/services/syncRequestRetry";
import {
  databaseSyncObjects,
  decodeSessionIndex,
  encodeDatabaseSyncVersion,
  encodeSessionList,
  localDatabaseVersion,
  readDatabaseSyncVersion,
  type DatabaseSyncVersion,
  type ChunkManifest,
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
  type SessionSyncFile,
} from "@/commands/piSession";
import type { ISyncProvider } from "@/types/sync";

interface SyncCommandOptions {
  onProgress?: (payload: DatabaseSyncProgress) => void;
}

interface UploadOptions extends SyncCommandOptions {
  /** 自动上传无人确认，云端比本机新时跳过，避免覆盖其他设备的修改。 */
  skipWhenRemoteNewer?: boolean;
}

const emitProgress = (
  options: SyncCommandOptions | undefined,
  value: number,
  status: DatabaseSyncStatus
) => {
  options?.onProgress?.({ value, status });
};

const describeSyncError = (error: unknown) =>
  error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { value: String(error) };

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
    toast.error(syncCommandTranslator.t("configure"));
    return false;
  }
  try {
    return await run(withSyncRequestRetry(syncProvider));
  } finally {
    await syncProvider.dispose?.();
  }
};

/** 会话传输最多三个并发，请求重试由提供方包装层负责。 */
const SESSION_TRANSFER_CONCURRENCY = 3;

/** 有限并发执行；出错后不再领取新任务，等在途任务结束再抛出首个错误。 */
async function runWithConcurrency<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (!failure && next < items.length) {
      const item = items[next++];
      try {
        await run(item);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
}

/** 版本、索引摘要与本地指纹一致时，直接沿用云端副本。 */
const sessionsToUpload = (
  files: SessionSyncFile[],
  cache: Awaited<ReturnType<typeof readSessionUploadCache>>,
  remoteVersion: number,
  manifests: Map<string, ChunkManifest>
) =>
  cache && cache.version === remoteVersion
    ? files.filter(file => {
        const previous = cache.files[file.name];
        return (
          !manifests.has(file.name) ||
          previous?.rootHash !== manifests.get(file.name)?.rootHash ||
          previous?.size !== file.size ||
          previous.mtimeMs !== file.mtimeMs
        );
      })
    : files;

/** 把本机库文件（及桌面对话记录）覆盖到云端固定位置，版本号最后写入。 */
export const upload = (options?: UploadOptions) =>
  withSyncProvider(provider => uploadWithProvider(provider, options));

const uploadWithProvider = async (syncProvider: ISyncProvider, options?: UploadOptions) => {
  const { database: databaseSetting, sync } = useSettingStore.getState().setting;
  const { active: databaseName, databases } = databaseSetting;
  const database = databases.find(item => item.name === databaseName);
  if (!database) return false;
  const previousLocalVersion = localDatabaseVersion(database);
  const databasePath = await getDatabasePath(databaseName);
  if (!databasePath) {
    console.error("[database-sync] upload failed before transfer", {
      databaseName,
      reason: "database path is not configured",
    });
    toast.error(syncCommandTranslator.t("directory"));
    return false;
  }

  emitProgress(options, 1, { kind: "prepare-sync" });
  const objects = await databaseSyncObjects(databaseName, chunkDigest);
  const remote = await readDatabaseSyncVersion(syncProvider, objects.version);
  console.info("[database-sync] upload version checked", {
    databaseName,
    localVersion: localDatabaseVersion(database),
    remoteVersion: remote.version,
  });
  if (options?.skipWhenRemoteNewer && remote.version > localDatabaseVersion(database)) {
    toast.warning(
      syncCommandTranslator.t("newerRemote", {
        version: remote.version.toLocaleString(desktopI18n.getSnapshot()),
      })
    );
    return false;
  }
  const pluginId = sync.plugin?.id;
  const cacheTarget = [
    pluginId,
    pluginId ? sync.plugin?.configurations[pluginId] : null,
    databaseName,
  ];

  const locked = await piSessionLockLibrary(databaseName);
  if (!locked.ok) {
    toast.error(locked.error ?? syncCommandTranslator.t("lockFailed"));
    return false;
  }
  try {
    console.info("[database-sync] upload started", { databaseName, databasePath });
    setDatabaseConnectionStatus(databaseName, "reconnecting");
    // 关库会把编辑器缓存写回并合并 WAL，上传的才是完整的库文件
    await closeDatabase(databaseName);

    const prepared = await piSessionSyncFiles(databaseName);
    if (!prepared.ok || !prepared.files)
      throw prepared.error
        ? new Error(prepared.error)
        : new SyncCommandError("sessionsReadFailed", "读取对话记录失败");
    const sessionFiles = prepared.files;
    const remoteIndex = (await syncProvider.fileExists(objects.sessions))
      ? await decodeSessionIndex(await syncProvider.downloadFile(objects.sessions), chunkDigest)
      : { files: [], manifests: new Map<string, ChunkManifest>() };
    const manifests = remoteIndex.manifests;
    console.info("[database-sync] upload session files prepared", {
      databaseName,
      count: sessionFiles.length,
      names: sessionFiles.map(file => file.name),
    });
    const pending = sessionsToUpload(
      sessionFiles,
      await readSessionUploadCache(cacheTarget),
      remote.version,
      manifests
    );

    // 进度按已处理字节计：准备占 2%，库文件与待传对话记录占 2%–97%，清单与版本号收尾
    const databaseSize = await syncFileSize(databasePath);
    const totalBytes = databaseSize + pending.reduce((sum, file) => sum + file.size, 0);
    let doneBytes = 0;
    let shown = 0;
    let status: DatabaseSyncStatus = { kind: "upload-database" };
    // 完整分块成功后才累计进度，失败请求重试不重复计数。
    const report = (bytes: number) => {
      doneBytes += bytes;
      shown = Math.max(shown, 2 + (totalBytes ? (doneBytes / totalBytes) * 95 : 95));
      emitProgress(options, shown, status);
    };
    report(0);
    await uploadChunkedPath(syncProvider, objects.database, databasePath, databaseName, report);

    status = { kind: "upload-sessions" };
    report(0);
    await runWithConcurrency(pending, SESSION_TRANSFER_CONCURRENCY, async file => {
      const manifest = await uploadChunkedPath(
        syncProvider,
        objects.session(file.name),
        file.path,
        file.name,
        report,
        manifests.get(file.name)
      );
      manifests.set(file.name, manifest);
    });
    const names = sessionFiles.map(file => file.name);
    const sessionManifests = names.map(name => {
      const manifest = manifests.get(name);
      if (!manifest) throw new SyncCommandError("indexIncomplete", "对话记录索引不完整");
      return manifest;
    });
    const index = encodeSessionList(names, sessionManifests);
    if (!(await syncProvider.uploadFile(objects.sessions, index)))
      throw new SyncCommandError("manifestUploadFailed", "对话记录清单上传失败");

    emitProgress(options, 98, { kind: "publish-version" });
    const version = Math.max(localDatabaseVersion(database), remote.version) + 1;
    if (!(await syncProvider.uploadFile(objects.version, encodeDatabaseSyncVersion(version))))
      throw new SyncCommandError("versionUploadFailed", "版本信息上传失败");
    setLocalVersion(databaseName, version);
    console.info("[database-sync] upload completed", {
      databaseName,
      previousLocalVersion,
      remoteVersion: remote.version,
      newVersion: version,
    });
    await writeSessionUploadCache(cacheTarget, {
      version,
      files: Object.fromEntries(
        sessionFiles.map((file, index) => [
          file.name,
          {
            size: file.size,
            mtimeMs: file.mtimeMs,
            rootHash: sessionManifests[index].rootHash,
          },
        ])
      ),
    }).catch(error => console.warn("记录对话上传状态失败，下次上传将全量检查:", error));

    emitProgress(options, 100, { kind: "sync-complete" });
    return true;
  } catch (e) {
    console.error("[database-sync] upload failed", {
      databaseName,
      databasePath,
      error: describeSyncError(e),
    });
    toast.error(syncCommandTranslator.t("uploadFailed", { reason: syncCommandErrorText(e) }));
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
    console.error("[database-sync] download failed before transfer", {
      databaseName,
      reason: "database path is not configured",
    });
    toast.error(syncCommandTranslator.t("directory"));
    return false;
  }

  emitProgress(options, 5, { kind: "check-remote" });
  const objects = await databaseSyncObjects(databaseName, chunkDigest);
  const remote = await readDatabaseSyncVersion(syncProvider, objects.version);
  console.info("[database-sync] download version checked", {
    databaseName,
    localVersion: localDatabaseVersion(databases.find(item => item.name === databaseName)),
    remoteVersion: remote.version,
  });
  if (remote.version === 0) {
    console.error("[database-sync] download failed before transfer", {
      databaseName,
      reason: "remote database version is missing",
    });
    toast.error(syncCommandTranslator.t("remoteMissing"));
    return false;
  }

  const locked = await piSessionLockLibrary(databaseName);
  if (!locked.ok) {
    console.error("[database-sync] download failed before transfer", {
      databaseName,
      reason: "session lock failed",
      error: locked.error,
    });
    toast.error(locked.error ?? syncCommandTranslator.t("lockFailed"));
    return false;
  }
  let succeeded = false;
  try {
    console.info("[database-sync] download started", {
      databaseName,
      databasePath,
      remoteVersion: remote.version,
    });
    setDatabaseConnectionStatus(databaseName, "reconnecting");
    await closeDatabase(databaseName, true);

    emitProgress(options, 20, { kind: "backup-database" });
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
      emitProgress(options, 25, { kind: "read-database-manifest" });
      console.info("[database-sync] downloading database file", {
        databaseName,
        target: downloadPath,
      });
      await downloadChunkedPath(syncProvider, objects.database, downloadPath, {
        onProgress: (done, total) => {
          emitProgress(options, 25 + (total ? done / total : 1) * 35, {
            kind: "download-database",
            done,
            total,
          });
        },
      });

      const hasSessions = await syncProvider.fileExists(objects.sessions);
      console.info("[database-sync] database file downloaded", { databaseName, hasSessions });
      const reusedSessionFiles: string[] = [];
      if (hasSessions) {
        emitProgress(options, 60, { kind: "read-sessions-manifest" });
        await removeFile(sessionDirectory).catch(() => undefined);
        await createDir(sessionDirectory);
        const sessionIndex = await decodeSessionIndex(
          await syncProvider.downloadFile(objects.sessions),
          chunkDigest
        );
        const sessionNames = sessionIndex.files;
        const fractions = new Map<string, number>();
        let completedFiles = 0;
        const transferBytes = new Map<string, { reused: number; downloaded: number }>();
        const totals = { reused: 0, downloaded: 0 };
        const reportSessions = () => {
          const fraction = sessionNames.length
            ? (completedFiles + [...fractions.values()].reduce((sum, value) => sum + value, 0)) /
              sessionNames.length
            : 1;
          emitProgress(options, 60 + fraction * 25, {
            kind: "download-sessions",
            done: completedFiles,
            total: sessionNames.length,
            reused: totals.reused,
            downloaded: totals.downloaded,
          });
        };
        reportSessions();
        const localFiles = new Map<string, SessionSyncFile>();
        try {
          const local = await piSessionSyncFiles(databaseName);
          if (!local.ok || !local.files)
            throw local.error
              ? new Error(local.error)
              : new SyncCommandError("localSessionsReadFailed", "读取本地会话列表失败");
          for (const file of local.files) localFiles.set(file.name, file);
        } catch (error) {
          console.warn("[database-sync] local session reuse unavailable", {
            databaseName,
            error: describeSyncError(error),
          });
        }
        console.info("[database-sync] downloading session files", {
          databaseName,
          count: sessionNames.length,
          names: sessionNames,
          targetDirectory: sessionDirectory,
          concurrency: SESSION_TRANSFER_CONCURRENCY,
        });
        await runWithConcurrency(sessionNames, SESSION_TRANSFER_CONCURRENCY, async name => {
          const target = `${sessionDirectory}${sep}${name}`;
          try {
            const manifest = await downloadChunkedPath(
              syncProvider,
              objects.session(name),
              target,
              {
                expectedName: name,
                manifest: sessionIndex.manifests.get(name),
                localPath: localFiles.get(name)?.path,
                onProgress: (done, total, reused) => {
                  const previous = transferBytes.get(name) ?? { reused: 0, downloaded: 0 };
                  totals.reused += reused - previous.reused;
                  totals.downloaded += done - reused - previous.downloaded;
                  transferBytes.set(name, { reused, downloaded: done - reused });
                  fractions.set(name, total ? done / total : 1);
                  reportSessions();
                },
              }
            );
            if (
              localFiles.get(name)?.size === manifest.size &&
              (transferBytes.get(name)?.reused ?? 0) === manifest.size
            ) {
              reusedSessionFiles.push(name);
            }
            completedFiles++;
            transferBytes.delete(name);
            fractions.delete(name);
            reportSessions();
          } catch (error) {
            console.error("[database-sync] session file download failed", {
              databaseName,
              name,
              target,
              error: describeSyncError(error),
            });
            throw error;
          }
        });
      }

      emitProgress(options, 85, { kind: "replace-database" });
      console.info("[database-sync] installing downloaded database", {
        databaseName,
        databasePath,
        sessionDirectory,
        hasSessions,
      });
      const installed = await piSessionInstallDownload(
        databaseName,
        hasSessions,
        reusedSessionFiles
      );
      if (!installed.ok)
        throw installed.error
          ? new Error(installed.error)
          : new SyncCommandError("installFailed", "替换本地数据库失败");
    } finally {
      await removeFile(downloadPath).catch(() => undefined);
      await removeFile(sessionDirectory).catch(() => undefined);
    }

    setLocalVersion(databaseName, remote.version);
    console.info("[database-sync] download completed", {
      databaseName,
      installedVersion: remote.version,
    });
    succeeded = true;
    return true;
  } catch (e) {
    console.error("[database-sync] download failed", {
      databaseName,
      databasePath,
      remoteVersion: remote.version,
      error: describeSyncError(e),
    });
    toast.error(syncCommandTranslator.t("downloadFailed", { reason: syncCommandErrorText(e) }));
    return false;
  } finally {
    try {
      // 自动同步随后虽会重载窗口，维护升级也必须在释放同步互斥前完成。
      if (succeeded) emitProgress(options, 95, { kind: "open-database" });
      await reconnectAfterSync(databaseName, "sync_download_reconnect", {
        mode: "maintenance",
      });
      if (succeeded) {
        void queryClient.invalidateQueries({
          predicate: query => isCurrentDatabaseQuery(query.queryKey),
        });
        emitProgress(options, 100, { kind: "download-complete" });
      }
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
    return await readDatabaseSyncVersion(withSyncRequestRetry(syncProvider), objects.version);
  } finally {
    await syncProvider.dispose?.();
  }
};
