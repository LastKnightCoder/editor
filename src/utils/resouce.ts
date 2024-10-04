import { fetch, ResponseType } from '@tauri-apps/api/http';
import { basename, sep } from "@tauri-apps/api/path";
import { createDir, exists, readTextFile, writeBinaryFile, writeTextFile } from '@tauri-apps/api/fs';
import { getEditorDir } from '@/commands';

// 将远程资源下载到本地
// 先查看是否已经下载过，如果没有则下载
// 下载记录保存到文件中
const REMOTE_RESOURCE_CONFIG_NAME = "remote_local_map.json";
const REMOTR_RESOURCE_PATH = 'remote-resources';
const LOCAL_RESOURCE_PATH = 'resources';
export const remoteResourceToLocal = async (url: string, fileName?: string) => {
  if (!fileName) {
    fileName = await basename(url);
  }
  const configDirPath = await getEditorDir();
  const configPath = configDirPath + sep + REMOTE_RESOURCE_CONFIG_NAME;
  const isExist = await exists(configPath);
  if (!isExist) {
    // 創建文件
    await writeTextFile(configPath, JSON.stringify({}));
  }
  const config = await readTextFile(configPath);
  const configObj = JSON.parse(config);
  if (configObj[url]) {
    return configObj[url];
  }
  const resourceDirPath = configDirPath + sep + REMOTR_RESOURCE_PATH;
  if (!await exists(resourceDirPath)) {
    await createDir(resourceDirPath);
  }
  const remoteContent = await fetch(url, {
    method: "GET",
    responseType: ResponseType.Binary
  }).then(res => res.data) as unknown as ArrayBuffer;

  const resourcePath = resourceDirPath + sep + fileName;
  await writeBinaryFile(resourcePath, new Uint8Array(remoteContent));
  configObj[url] = resourcePath;
  await writeTextFile(configPath, JSON.stringify(configObj));
  return resourcePath;
}

export const copyFileToLocal = async (file: File, fileName = file.name) => {
  const editorPath = await getEditorDir();
  const resourceDirPath = editorPath + sep + LOCAL_RESOURCE_PATH
  if (!await exists(resourceDirPath)) {
    await createDir(resourceDirPath);
  }
  const resourcePath = resourceDirPath + sep + fileName;
  await writeBinaryFile(resourcePath, new Uint8Array(await file.arrayBuffer()));
  return resourcePath;
}