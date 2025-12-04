import { IRemoteFileInfo, ISyncProvider } from "@/types/sync";
import { webdavUpload, webdavDownload, webdavList } from "@/commands";

export interface IWebDavConfig {
  url: string;
  username: string;
  password: string;
  pathPrefix: string;
}

export class WebDavSyncProvider implements ISyncProvider {
  private config: IWebDavConfig;

  constructor(config: IWebDavConfig) {
    this.config = config;
  }

  getProviderName(): string {
    return "WebDAV";
  }

  async uploadFile(objectName: string, content: Uint8Array): Promise<boolean> {
    try {
      const remotePath = this.config.pathPrefix
        ? `${this.config.pathPrefix.replace(/\/$/, "")}/${objectName}`
        : `/${objectName}`;

      await webdavUpload({
        url: this.config.url,
        username: this.config.username,
        password: this.config.password,
        remotePath,
        file: content,
      });

      return true;
    } catch (e) {
      console.error("WebDAV 上传失败:", e);
      return false;
    }
  }

  async downloadFile(objectName: string): Promise<Uint8Array> {
    try {
      const remotePath = this.config.pathPrefix
        ? `${this.config.pathPrefix.replace(/\/$/, "")}/${objectName}`
        : `/${objectName}`;

      return await webdavDownload({
        url: this.config.url,
        username: this.config.username,
        password: this.config.password,
        remotePath,
      });
    } catch (e) {
      console.error("WebDAV 下载失败:", e);
      throw e;
    }
  }

  async fileExists(objectName: string): Promise<boolean> {
    // WebDAV 检查文件存在可以尝试下载并捕获错误
    try {
      await this.downloadFile(objectName);
      return true;
    } catch (e) {
      return false;
    }
  }

  async deleteFile(_objectName: string): Promise<boolean> {
    // WebDAV 删除文件需要在后端实现，这里暂不支持
    console.warn("WebDAV 删除文件暂不支持");
    return false;
  }

  async listFiles(prefix?: string): Promise<IRemoteFileInfo[]> {
    const basePath = this.config.pathPrefix.replace(/\/$/, "");
    const extraPath = prefix ? prefix.replace(/^\/+/, "") : "";
    const remotePath = [basePath, extraPath].filter((p) => p).join("/");
    const mergedPath = remotePath.replace(/^\/+/, "");
    const normalizedRemotePath = mergedPath
      ? `/${mergedPath.replace(/\/+/g, "/")}`
      : "/";

    try {
      const remoteFiles = await webdavList({
        url: this.config.url,
        username: this.config.username,
        password: this.config.password,
        remotePath: normalizedRemotePath,
      });

      return remoteFiles.map((file) => {
        const relativePath = this.normalizeRelativePath(
          file.path || file.name,
          this.config.pathPrefix,
        );
        const name =
          relativePath.split("/").filter(Boolean).pop() || relativePath;
        return {
          ...file,
          name,
          path: relativePath,
        };
      });
    } catch (e) {
      console.error("WebDAV 获取文件列表失败:", e);
      return [];
    }
  }

  private normalizeRelativePath(remotePath: string, basePath?: string) {
    const normalized = remotePath.replace(/^\/+/, "");
    const base = (basePath || "").replace(/^\/+/, "").replace(/\/+$/, "");
    if (!base) return normalized;
    if (normalized.startsWith(`${base}/`)) {
      return normalized.slice(base.length + 1);
    }
    if (normalized === base) {
      return "";
    }
    return normalized;
  }
}
