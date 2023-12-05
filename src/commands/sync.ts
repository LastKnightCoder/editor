import { message } from "antd";
import { produce } from "immer";
import dayjs from "dayjs";

import { invoke } from "@tauri-apps/api";
import { readBinaryFile, writeBinaryFile, createDir, exists } from '@tauri-apps/api/fs';
import { sep } from '@tauri-apps/api/path';
import { getObject, isObjectExist, createObject, updateObject } from "@/commands/ali_oss.ts";

import useSettingStore from "@/stores/useSettingStore.ts";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";

export const getDatabasePath = async (): Promise<string> => {
  try {
    return await invoke('get_database_path');
  } catch (e) {
    return '';
  }
}

export const upload = async () => {
  const databasePath = await getDatabasePath();
  if (!databasePath) {
    message.error('请先设置数据库目录');
    return false;
  }

  const {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    path,
  } = useSettingStore.getState().setting.sync.aliOSS;

  const ossOptions = {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
  }

  const { databaseInfoObjectName, databaseInfo } = await getOriginDatabaseInfo();

  // @ts-ignore
  const originVersion = Number(databaseInfo.version || 0);
  const currentVersion = useSettingStore.getState().setting.sync.version;
  if (originVersion > currentVersion) {
    message.error('远程的数据库版本高于本地版本，请先同步远程数据库');
    return false;
  }

  const newDatabaseInfo = {
    ...databaseInfo,
    version: currentVersion + 1,
  }

  try {
    console.log('...upload database info', newDatabaseInfo);
    const isSuccess = await createOrUpdateFile(ossOptions, databaseInfoObjectName, new Blob([JSON.stringify(newDatabaseInfo)]));
    if (!isSuccess) {
      console.log('...upload database info failed');
      return false;
    }
    useSettingStore.setState(produce(useSettingStore.getState(), (draft) => {
      draft.setting.sync.version = currentVersion + 1;
    }));
  } catch (e) {
    console.log('...upload database info failed, in catch', e);
    return false;
  }

  try {
    console.log('...upload database file');
    // 读取本地数据库文件并上传
    const contents = await readBinaryFile(databasePath);
    // 将 Uint8Array 转换为 Blob
    const blob = new Blob([contents], { type: 'application/octet-stream' });
    const dataObjectName = `${path}/data.db`;
    const isSuccessful =  await createOrUpdateFile(ossOptions, dataObjectName, blob);
    if (!isSuccessful) {
      console.log('...upload database file failed');
      return false;
    }
  } catch (e) {
    // 恢复数据库信息
    const isSuccess = await createOrUpdateFile(ossOptions, databaseInfoObjectName, new Blob([JSON.stringify(databaseInfo)]));
    if (!isSuccess) {
      console.log('...restore database info failed');
    }
    console.log('...upload database file failed, in catch', e);
    return false;
  }
}

export const download = async () => {
  const databasePath = await getDatabasePath();
  if (!databasePath) {
    message.error('请先设置数据库目录');
    return false;
  }

  const {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    path,
  } = useSettingStore.getState().setting.sync.aliOSS;

  const ossOptions = {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
  }

  const { databaseInfo } = await getOriginDatabaseInfo();

  // @ts-ignore
  const originVersion = Number(databaseInfo.version || 0);
  const currentVersion = useSettingStore.getState().setting.sync.version;
  if (currentVersion > originVersion) {
    message.error('本地的数据库版本高于远程版本，请先同步本地数据库');
    return false;
  }

  // 下载数据库文件
  const dataObjectName = `${path}/data.db`;
  try {
    const dataObject = await getObject({
      ...ossOptions,
      objectName: dataObjectName,
    });
    const blob = new Blob([dataObject.content]);
    const contents = new Uint8Array(await blob.arrayBuffer());
    // 在覆盖本地文件之前，先备份一下，加上时间
    const backupDir = databasePath.split(sep).slice(0, -1).concat("backup").join(sep);
    if (!await exists(backupDir)) {
      await createDir(backupDir, { recursive: true });
    }
    const backupPath = String.raw`${backupDir}${sep}version-${originVersion}-${dayjs().format('YYYY-MM-DD-hh-mm-ss')}-data.db`;
    const originContents = await readBinaryFile(databasePath);
    await writeBinaryFile(backupPath, originContents);
    await writeBinaryFile(databasePath, contents);
    useSettingStore.setState(produce(useSettingStore.getState(), (draft) => {
      draft.setting.sync.version = originVersion;
    }));
    await invoke('reconnect_database');
    await useCardsManagementStore.getState().init();
    await useArticleManagementStore.getState().init();
    await useDocumentsStore.getState().init();
    return true;
  } catch (e) {
    console.log('...download database file failed', e);
    return false;
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

  const ossOptions = {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
  }

  const databaseInfoFileName = 'database.json';
  const databaseInfoObjectName = `${path}/${databaseInfoFileName}`;

  const isDatabaseInfoExist = await isObjectExist({
    ...ossOptions,
    objectName: databaseInfoObjectName,
  });
  let databaseInfo = {};
  if (isDatabaseInfoExist) {
    const databaseInfoResult = await getObject({
      ...ossOptions,
      objectName: databaseInfoObjectName,
    });
    databaseInfo = JSON.parse(databaseInfoResult.content.toString());
  }

  return {
    isDatabaseInfoExist,
    databaseInfo,
    databaseInfoObjectName,
  }
}

const createOrUpdateFile = async (ossOptions: any, objectName: string, content: Blob) => {
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
    console.log('...createOrUpdateFile failed', objectName, e);
    return false;
  }
}