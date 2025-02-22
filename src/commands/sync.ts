import { message } from "antd";
import { produce } from "immer";
import dayjs from "dayjs";

import { invoke } from "@/electron";
import {
  getObject,
  isObjectExist,
  createObject,
  updateObject,
  connectDatabaseByName,
  readBinaryFile,
  writeBinaryFile,
  createDir,
  pathExists,
  getSep, closeDatabase, forceCheckpoint
} from "@/commands";

import useSettingStore from "@/stores/useSettingStore.ts";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import useProjectsStore from "@/stores/useProjectsStore";
import useDailyNoteStore from "@/stores/useDailyNoteStore";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import usePdfsStore from "@/stores/usePdfsStore.ts";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore.ts";
import useChatMessageStore from "@/stores/useChatMessageStore.ts";

export const getDatabasePath = async (databaseName: string): Promise<string> => {
  try {
    return await invoke('get-database-path', databaseName);
  } catch (e) {
    return '';
  }
}

export const upload = async () => {
  const {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    path,
  } = useSettingStore.getState().setting.sync.aliOSS;
  const {
    active: databaseName,
    databases,
  } = useSettingStore.getState().setting.database;

  const database = databases.find((item) => item.name === databaseName);
  if (!database) return;
  const { version: currentVersion } = database;

  const databasePath = await getDatabasePath(databaseName);
  const walFilePath = `${databasePath}-wal`;
  const shmFilePath = `${databasePath}-shm`;
  if (!databasePath) {
    message.error('请先设置数据库目录');
    return false;
  }

  const res = await forceCheckpoint(databaseName);
  if (!res) {
    message.error('强制检查点失败');
    // return false;
  }

  const ossOptions = {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
  }

  const { databaseInfoObjectName, databaseInfo } = await getOriginDatabaseInfo();

  // @ts-ignore
  const originVersion = Number(databaseInfo.version || 0);
  if (isNaN(originVersion)) {
    message.error('远程数据库信息版本号不是一个数字');
    return false;
  }
  if (originVersion > currentVersion) {
    message.error('远程的数据库版本高于本地版本，请先同步远程数据库');
    return false;
  }

  const newDatabaseInfo = {
    ...databaseInfo,
    version: currentVersion + 1,
  }

  const textEncoder = new TextEncoder();

  try {
    const isSuccess = await createOrUpdateFile(ossOptions, databaseInfoObjectName, textEncoder.encode(JSON.stringify(newDatabaseInfo)));
    if (!isSuccess) {
      message.error('上传数据库信息失败');
      return false;
    }
    useSettingStore.setState(produce(useSettingStore.getState(), (draft) => {
      const databases = draft.setting.database.databases;
      const index = databases.findIndex((item) => item.name === databaseName);
      databases[index].version = currentVersion + 1;
    }));
  } catch (e) {
    message.error('上传数据库信息失败, in catch' + e);
    return false;
  }

  try {
    // 读取本地数据库文件并上传
    const contents = await readBinaryFile(databasePath);
    const walContents = await readBinaryFile(walFilePath);
    const shmContents = await readBinaryFile(shmFilePath);
    // 将 Uint8Array 转换为 Blob
    const dataObjectName = `${path}/${databaseName}`;
    const walObjectName = `${path}/${databaseName}-wal`;
    const shmObjectName = `${path}/${databaseName}-shm`;
    const isSuccessful = await createOrUpdateFile(ossOptions, dataObjectName, contents) &&
      await createOrUpdateFile(ossOptions, walObjectName, walContents) &&
      await createOrUpdateFile(ossOptions, shmObjectName, shmContents);
    if (!isSuccessful) {
      message.error('上传数据库文件失败');
      return false;
    }

    return true;
  } catch (e) {
    // 恢复数据库信息
    const isSuccess = await createOrUpdateFile(ossOptions, databaseInfoObjectName, textEncoder.encode(JSON.stringify(databaseInfo)));
    if (!isSuccess) {
      message.error('上传数据库文件失败后恢复数据库信息失败');
    }
    message.error('上传数据库文件失败，error: ' + e);
    return false;
  }
}

export const download = async () => {
  const {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    path,
  } = useSettingStore.getState().setting.sync.aliOSS;

  const {
    active: databaseName,
    databases,
  } = useSettingStore.getState().setting.database;

  const database = databases.find((item) => item.name === databaseName);
  if (!database) return;
  const { version: currentVersion } = database;

  const databasePath = await getDatabasePath(databaseName);

  const walFilePath = `${databasePath}-wal`;
  const shmFilePath = `${databasePath}-shm`;
  if (!databasePath) {
    message.error('请先设置数据库目录');
    return false;
  }

  const ossOptions = {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
  }

  const { databaseInfo } = await getOriginDatabaseInfo();

  // @ts-ignore
  const originVersion = Number(databaseInfo.version || 0);
  if (currentVersion > originVersion) {
    message.error('本地的数据库版本高于远程版本，请先同步本地数据库');
    return false;
  }

  // 下载数据库文件
  const dataObjectName = `${path}/${databaseName}`;
  const walObjectName = `${path}/${databaseName}-wal`;
  const shmObjectName = `${path}/${databaseName}-shm`;
  try {
    await closeDatabase(databaseName);

    const dataObject = await getObject({
      ...ossOptions,
      objectName: dataObjectName,
    });
    const walObject = await getObject({
      ...ossOptions,
      objectName: walObjectName,
    });
    const shmObject = await getObject({
      ...ossOptions,
      objectName: shmObjectName,
    });
    const blob = new Blob([dataObject.content]);
    const walBlob = new Blob([walObject.content]);
    const shmBlob = new Blob([shmObject.content]);

    const contents = new Uint8Array(await blob.arrayBuffer());
    const walContents = new Uint8Array(await walBlob.arrayBuffer());
    const shmContents = new Uint8Array(await shmBlob.arrayBuffer());

    const sep = await getSep();
    // 在覆盖本地文件之前，先备份一下，加上时间
    const backupDir = databasePath.split(sep).slice(0, -1).concat("backup").join(sep);
    if (!await pathExists(backupDir)) {
      await createDir(backupDir);
    }
    const backupPath = String.raw`${backupDir}${sep}version-${originVersion}-${dayjs().format('YYYY-MM-DD-hh-mm-ss')}-${databaseName}`;
    const walBackupPath = String.raw`${backupDir}${sep}version-${originVersion}-${dayjs().format('YYYY-MM-DD-hh-mm-ss')}-${databaseName}-wal`;
    const shmBackupPath = String.raw`${backupDir}${sep}version-${originVersion}-${dayjs().format('YYYY-MM-DD-hh-mm-ss')}-${databaseName}-shm`;

    try {
      const originContents = await readBinaryFile(databasePath);
      const walOriginContents = await readBinaryFile(walFilePath);
      const shmOriginContents = await readBinaryFile(shmFilePath);

      await writeBinaryFile(backupPath, originContents);
      await writeBinaryFile(walBackupPath, walOriginContents);
      await writeBinaryFile(shmBackupPath, shmOriginContents);
    } catch (e) {
      message.error('备份数据库文件失败');
    }

    await writeBinaryFile(databasePath, contents);
    await writeBinaryFile(walFilePath, walContents);
    await writeBinaryFile(shmFilePath, shmContents);

    useSettingStore.setState(produce(useSettingStore.getState(), (draft) => {
      const databases = draft.setting.database.databases;
      const index = databases.findIndex((item) => item.name === databaseName);
      databases[index].version = originVersion;
    }));

    return true;
  } catch (e) {
    message.error('下载数据库文件失败，error: ' + e);
    return false;
  } finally {
    await connectDatabaseByName(databaseName, true);
    await Promise.all([
      useCardsManagementStore.getState().init(),
      useArticleManagementStore.getState().init(),
      useDocumentsStore.getState().init(),
      useProjectsStore.getState().init(),
      useDailyNoteStore.getState().init(),
      useTimeRecordStore.getState().init(),
      usePdfsStore.getState().initPdfs(),
      useWhiteBoardStore.getState().initWhiteBoards(),
      useChatMessageStore.getState().initChatMessage(),
    ]);
    const event = new CustomEvent('database-sync-finish');
    document.dispatchEvent(event);
  }
}

export const getOriginDatabaseInfo = async () => {
  const {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    path,
  } = useSettingStore.getState().setting.sync.aliOSS;
  const {
    active: databaseName,
  } = useSettingStore.getState().setting.database;

  const ossOptions = {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
  }

  const databaseInfoFileName = `database_${databaseName}.json`;
  const databaseInfoObjectName = `${path}/${databaseInfoFileName}`;

  const isDatabaseInfoExist = await isObjectExist({
    ...ossOptions,
    objectName: databaseInfoObjectName,
  });
  let databaseInfo = {};
  if (isDatabaseInfoExist) {
    try {
      const databaseInfoResult = await getObject({
        ...ossOptions,
        objectName: databaseInfoObjectName,
      });
      const textDecoder = new TextDecoder();
      databaseInfo = JSON.parse(textDecoder.decode(databaseInfoResult.content));
    } catch (e) {
      message.error('获取远程数据库信息失败');
    }
  }

  return {
    isDatabaseInfoExist,
    databaseInfo,
    databaseInfoObjectName,
  }
}

const createOrUpdateFile = async (ossOptions: any, objectName: string, content: Uint8Array) => {
  try {
    const isExist = await isObjectExist({
      ...ossOptions,
      objectName,
    })
    if (isExist) {
      await updateObject({
        ...ossOptions,
        objectName,
      }, content);
    } else {
      await createObject({
        ...ossOptions,
        objectName,
      }, content);
    }
    return true;
  } catch (e) {
    return false;
  }
}
