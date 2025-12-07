import { message } from "antd";
import { produce } from "immer";
import dayjs from "dayjs";

import { invoke } from "@/electron";
import {
  connectDatabaseByName,
  readBinaryFile,
  writeBinaryFile,
  createDir,
  pathExists,
  getSep,
  closeDatabase,
  removeFile,
} from "@/commands";

import useSettingStore from "@/stores/useSettingStore.ts";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import { SyncProviderFactory } from "@/utils/sync";
import type { IDatabaseInfo } from "@/types/sync";

interface SyncCommandOptions {
  onProgress?: (payload: { value: number; status: string }) => void;
}

const emitProgress = (
  options: SyncCommandOptions | undefined,
  value: number,
  status: string,
) => {
  options?.onProgress?.({ value, status });
};

export const getDatabasePath = async (
  databaseName: string,
): Promise<string> => {
  try {
    return await invoke("get-database-path", databaseName);
  } catch (e) {
    return "";
  }
};

export const upload = async (options?: SyncCommandOptions) => {
  const syncProvider = SyncProviderFactory.getSyncProvider();
  if (!syncProvider) {
    message.error("请先配置同步设置");
    return false;
  }

  const { active: databaseName, databases } =
    useSettingStore.getState().setting.database;

  const database = databases.find((item) => item.name === databaseName);
  if (!database) return false;
  const { version: currentVersion } = database;

  const databasePath = await getDatabasePath(databaseName);

  if (!databasePath) {
    message.error("请先设置数据库目录");
    return false;
  }

  emitProgress(options, 5, "正在准备同步...");

  await closeDatabase(databaseName);
  emitProgress(options, 15, "正在关闭数据库连接...");

  const { databaseInfoObjectName, databaseInfo } =
    await getOriginDatabaseInfo();
  emitProgress(options, 25, "正在校验远程数据库版本...");

  const originVersion = Number(databaseInfo.version || 0);
  if (isNaN(originVersion)) {
    message.error("远程数据库信息版本号不是一个数字");
    await connectDatabaseByName(databaseName, true);
    return false;
  }
  if (originVersion > currentVersion) {
    message.error("远程的数据库版本高于本地版本，请先同步远程数据库");
    await connectDatabaseByName(databaseName, true);
    return false;
  }

  const newDatabaseInfo: IDatabaseInfo = {
    ...databaseInfo,
    version: currentVersion + 1,
  };

  const textEncoder = new TextEncoder();

  try {
    // 上传数据库信息文件
    emitProgress(options, 40, "正在上传版本信息...");
    const infoSuccess = await syncProvider.uploadFile(
      databaseInfoObjectName,
      textEncoder.encode(JSON.stringify(newDatabaseInfo)),
    );
    if (!infoSuccess) {
      message.error("上传数据库信息失败");
      await connectDatabaseByName(databaseName, true);
      return false;
    }

    // 更新本地版本号
    emitProgress(options, 55, "正在更新本地版本记录...");
    useSettingStore.setState(
      produce(useSettingStore.getState(), (draft) => {
        const databases = draft.setting.database.databases;
        const index = databases.findIndex((item) => item.name === databaseName);
        databases[index].version = currentVersion + 1;
      }),
    );
  } catch (e) {
    message.error("上传数据库信息失败: " + e);
    await connectDatabaseByName(databaseName, true);
    return false;
  }

  try {
    // 上传数据库文件
    emitProgress(options, 70, "正在上传数据库文件...");
    const contents = await readBinaryFile(databasePath);
    const dataObjectName = databaseName;
    const dataSuccess = await syncProvider.uploadFile(dataObjectName, contents);

    if (!dataSuccess) {
      // 恢复数据库信息
      await syncProvider.uploadFile(
        databaseInfoObjectName,
        textEncoder.encode(JSON.stringify(databaseInfo)),
      );
      message.error("上传数据库文件失败");
      await connectDatabaseByName(databaseName, true);
      return false;
    }

    emitProgress(options, 100, "同步完成");
    return true;
  } catch (e) {
    // 恢复数据库信息
    try {
      await syncProvider.uploadFile(
        databaseInfoObjectName,
        textEncoder.encode(JSON.stringify(databaseInfo)),
      );
    } catch (restoreError) {
      message.error("上传数据库文件失败后恢复数据库信息失败");
    }
    message.error("上传数据库文件失败: " + e);
    return false;
  } finally {
    await connectDatabaseByName(databaseName, true);
  }
};

export const download = async (options?: SyncCommandOptions) => {
  const syncProvider = SyncProviderFactory.getSyncProvider();
  if (!syncProvider) {
    message.error("请先配置同步设置");
    return false;
  }

  const { active: databaseName, databases } =
    useSettingStore.getState().setting.database;

  const database = databases.find((item) => item.name === databaseName);
  if (!database) return false;
  const { version: currentVersion } = database;

  const databasePath = await getDatabasePath(databaseName);

  const walFilePath = `${databasePath}-wal`;
  const shmFilePath = `${databasePath}-shm`;
  if (!databasePath) {
    message.error("请先设置数据库目录");
    return false;
  }

  emitProgress(options, 5, "正在检查远程版本...");

  const { databaseInfo } = await getOriginDatabaseInfo();

  const originVersion = Number(databaseInfo.version || 0);
  if (currentVersion > originVersion) {
    message.error("本地的数据库版本高于远程版本，请先同步本地数据库");
    return false;
  }

  // 下载数据库文件
  const dataObjectName = databaseName;
  try {
    await closeDatabase(databaseName);
    emitProgress(options, 20, "正在关闭数据库连接...");
    useGlobalStateStore.setState(
      produce(useGlobalStateStore.getState(), (draft) => {
        draft.databaseStatus[databaseName] = false;
      }),
    );

    const sep = await getSep();
    // 在覆盖本地文件之前，先备份一下，加上时间
    const backupDir = databasePath
      .split(sep)
      .slice(0, -1)
      .concat("backup")
      .join(sep);
    if (!(await pathExists(backupDir))) {
      await createDir(backupDir);
    }

    const backupPath = String.raw`${backupDir}${sep}version-${originVersion}-${dayjs().format("YYYY-MM-DD-hh-mm-ss")}-${databaseName}`;

    try {
      const originContents = await readBinaryFile(databasePath);
      await writeBinaryFile(backupPath, originContents);
      emitProgress(options, 40, "正在备份本地数据库...");
    } catch (e) {
      message.warning("备份数据库文件失败，停止下载");
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
      await writeBinaryFile(databasePath, contents);
      emitProgress(options, 85, "正在更新本地数据库...");
    } catch (e) {
      databaseDownloadSuccess = false;
      console.error("下载数据库文件失败:", e);
    }

    const isSuccessful = databaseDownloadSuccess;

    if (isSuccessful) {
      useSettingStore.setState(
        produce(useSettingStore.getState(), (draft) => {
          const databases = draft.setting.database.databases;
          const index = databases.findIndex(
            (item) => item.name === databaseName,
          );
          databases[index].version = originVersion;
        }),
      );
      emitProgress(options, 100, "下载完成");
    } else {
      // 尝试恢复数据库信息，读取备份数据还原
      try {
        const dataContent = await readBinaryFile(backupPath);
        await writeBinaryFile(databasePath, dataContent);
      } catch (e) {
        message.error(
          "恢复数据库文件失败，当前数据库文件可能存在损坏，可从备份文件夹手动备份",
        );
      }
    }

    return isSuccessful;
  } catch (e) {
    message.error("下载数据库文件失败: " + e);
    return false;
  } finally {
    await connectDatabaseByName(databaseName, true);
    useGlobalStateStore.setState(
      produce(useGlobalStateStore.getState(), (draft) => {
        draft.databaseStatus[databaseName] = true;
      }),
    );
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
      isDatabaseInfoExist = await syncProvider.fileExists(
        databaseInfoObjectName,
      );
      if (isDatabaseInfoExist) {
        const content = await syncProvider.downloadFile(databaseInfoObjectName);
        const textDecoder = new TextDecoder();
        databaseInfo = JSON.parse(textDecoder.decode(content));
      }
    } catch (e) {
      console.error("获取远程数据库信息失败:", e);
    }
  }

  return {
    isDatabaseInfoExist,
    databaseInfo,
    databaseInfoObjectName,
  };
};
