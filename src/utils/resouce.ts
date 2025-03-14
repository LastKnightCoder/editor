import {
  getEditorDir,
  createDir,
  pathExists,
  writeBinaryFile,
  writeTextFile,
  readTextFile,
  getFileBaseName,
  getSep,
  nodeFetch,
} from "@/commands";

// 将远程资源下载到本地
// 先查看是否已经下载过，如果没有则下载
// 下载记录保存到文件中
const REMOTE_RESOURCE_CONFIG_NAME = "remote_local_map.json";
const REMOTE_RESOURCE_PATH = "remote-resources";
const LOCAL_RESOURCE_PATH = "resources";

export const remoteResourceToLocal = async (url: string, fileName?: string) => {
  if (!fileName) {
    fileName = await getFileBaseName(url);
    if (url.includes("mmbiz.qpic.cn")) {
      try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const [, format, name] = pathname.split("/");
        const [, type] = format.split("_");
        fileName = `${name}.${type}`;
      } catch (e) {
        console.error(e);
      }
    }
  }

  const sep = await getSep();
  const configDirPath = await getEditorDir();
  const configPath = configDirPath + sep + REMOTE_RESOURCE_CONFIG_NAME;
  const isExist = await pathExists(configPath);
  if (!isExist) {
    // 創建文件
    await writeTextFile(configPath, JSON.stringify({}));
  }

  const config = await readTextFile(configPath);
  let configObj: Record<string, string> = {};
  try {
    configObj = JSON.parse(config);
  } catch (e) {
    console.error(e);
  }
  if (configObj[url]) {
    if (!(await pathExists(configObj[url]))) {
      delete configObj[url];
    } else {
      return configObj[url];
    }
  }

  const resourceDirPath = configDirPath + sep + REMOTE_RESOURCE_PATH;
  if (!(await pathExists(resourceDirPath))) {
    await createDir(resourceDirPath);
  }

  const remoteContent = (await nodeFetch(url, {
    method: "GET",
    responseType: "arraybuffer",
    headers: url.startsWith("https://mmbiz.qpic.cn")
      ? {
          Origin: "https://mp.weixin.qq.com",
          Referer: "https://mp.weixin.qq.com/",
        }
      : undefined,
  })) as unknown as ArrayBuffer;

  const resourcePath = resourceDirPath + sep + fileName;
  await writeBinaryFile(resourcePath, new Uint8Array(remoteContent));
  configObj[url] = resourcePath;
  await writeTextFile(configPath, JSON.stringify(configObj));
  return resourcePath;
};

export const copyFileToLocal = async (file: File, fileName = file.name) => {
  const editorPath = await getEditorDir();
  const sep = await getSep();
  const resourceDirPath = editorPath + sep + LOCAL_RESOURCE_PATH;
  if (!(await pathExists(resourceDirPath))) {
    await createDir(resourceDirPath);
  }
  const resourcePath = resourceDirPath + sep + fileName;
  await writeBinaryFile(resourcePath, new Uint8Array(await file.arrayBuffer()));
  return resourcePath;
};
