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
  getHomeDir,
  generateCacheKey,
  webdavDownload,
} from "@/commands";
import useSettingStore from "@/stores/useSettingStore";

// 将远程资源下载到本地
// 先查看是否已经下载过，如果没有则下载
// 下载记录保存到文件中
const REMOTE_RESOURCE_CONFIG_NAME = "remote_local_map.json";
const REMOTE_RESOURCE_PATH = "remote-resources";
const LOCAL_RESOURCE_PATH = "resources";

interface RemoteResourceConfigContext {
  sep: string;
  configDirPath: string;
  configPath: string;
  config: Record<string, string>;
}

const ensureRemoteResourceConfig = async (): Promise<RemoteResourceConfigContext> => {
  const sep = await getSep();
  const configDirPath = await getEditorDir();
  const configPath = configDirPath + sep + REMOTE_RESOURCE_CONFIG_NAME;
  if (!(await pathExists(configPath))) {
    await writeTextFile(configPath, JSON.stringify({}));
  }

  let config: Record<string, string> = {};
  try {
    const content = await readTextFile(configPath);
    config = content ? (JSON.parse(content) as Record<string, string>) : {};
  } catch (e) {
    console.error("解析远程资源缓存配置失败:", e);
    config = {};
  }

  return { sep, configDirPath, configPath, config };
};

const saveRemoteResourceConfig = async (configPath: string, config: Record<string, string>) => {
  await writeTextFile(configPath, JSON.stringify(config));
};

export const getFileExtension = async (url: string): Promise<string> => {
  let pathname = url;
  try {
    const urlObj = new URL(url);
    pathname = urlObj.pathname;
  } catch (e) {
    // ignore parse error, treat as plain path
  }

  const normalized = pathname.replace(/\\/g, "/");
  const lastSegment = normalized.split("/").pop() || normalized;
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === lastSegment.length - 1) {
    return "";
  }
  return lastSegment.slice(dotIndex + 1);
};

export const remoteResourceToLocal = async (url: string, fileName?: string) => {
  if (!fileName) {
    fileName = await getFileBaseName(url);
    // 微信公众号图片，需要特殊处理
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

  const { sep, configDirPath, configPath, config: configObj } = await ensureRemoteResourceConfig();

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

  let remoteContent: ArrayBuffer;

  // 检查是否是 WebDAV 资源
  const { setting } = useSettingStore.getState();
  const webdavConfig = setting.integration.webdav;
  const isWebDav = webdavConfig.url && url.startsWith(webdavConfig.url.replace(/\/$/, ""));

  if (isWebDav) {
    // 使用 WebDAV 下载
    try {
      const remotePath = url.replace(webdavConfig.url.replace(/\/$/, ""), "");
      const content = await webdavDownload({
        url: webdavConfig.url,
        username: webdavConfig.username,
        password: webdavConfig.password,
        remotePath,
      });
      remoteContent = content.buffer as unknown as ArrayBuffer;
    } catch (e) {
      console.error("WebDAV 下载失败:", e);
      throw e;
    }
  } else {
    console.log("使用普通 HTTP 下载:", url);
    // 使用普通 HTTP 下载
    remoteContent = (await nodeFetch(url, {
      method: "GET",
      responseType: "arraybuffer",
      // 微信公众号图片，需要特殊处理
      headers: url.startsWith("https://mmbiz.qpic.cn")
        ? {
            Origin: "https://mp.weixin.qq.com",
            Referer: "https://mp.weixin.qq.com/",
          }
        : undefined,
    })) as unknown as ArrayBuffer;
  }

  const ext = await getFileExtension(url);
  const cacheKey = await generateCacheKey(url);
  const resourcePath = resourceDirPath + sep + cacheKey + (ext ? "." + ext : "");
  await writeBinaryFile(resourcePath, new Uint8Array(remoteContent));
  configObj[url] = resourcePath;
  await saveRemoteResourceConfig(configPath, configObj);
  return resourcePath;
};

export const copyFileToLocal = async (file: File, fileName = file.name) => {
  const editorPath = await getEditorDir();
  const sep = await getSep();
  const resourceDirPath = editorPath + sep + LOCAL_RESOURCE_PATH;
  if (!(await pathExists(resourceDirPath))) {
    await createDir(resourceDirPath);
  }
  const cacheKey = await generateCacheKey(fileName);
  const ext = await getFileExtension(fileName);
  const resourcePath = resourceDirPath + sep + cacheKey + (ext ? "." + ext : "");
  await writeBinaryFile(resourcePath, new Uint8Array(await file.arrayBuffer()));
  const homeDir = await getHomeDir();
  return resourcePath.replace(homeDir, "~");
};
