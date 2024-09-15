import { writeBinaryFile, writeTextFile, createDir, readTextFile, exists } from '@tauri-apps/api/fs';
import { getDatabasePath } from '@/commands';
import { basename, sep } from "@tauri-apps/api/path";


// 将远程资源下载到本地
// 先查看是否已经下载过，如果没有则下载
// 下载记录保存到文件中
const REMOTE_RESOURCE_CONFIG_NAME = "remote_local_map.json";
const RESOURCE_PATH = 'resources';
export const remoteResourceToLocal = async (url: string, fileName?: string) => {
  if (!fileName) {
    fileName = await basename(url);
  }
  const path = await getDatabasePath('xxx');
  const configDirPath = path.split(sep).slice(0, -1).join(sep);
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
  const resourceDirPath = configDirPath + sep + RESOURCE_PATH;
  if (!await exists(resourceDirPath)) {
    await createDir(resourceDirPath);
  }
  const remoteContent = await fetch(url).then(res => res.blob());
  const resourcePath = resourceDirPath + sep + fileName;
  await writeBinaryFile(resourcePath, new Uint8Array(await remoteContent.arrayBuffer()));
  configObj[url] = resourcePath;
  await writeTextFile(configPath, JSON.stringify(configObj));
  return resourcePath;
}