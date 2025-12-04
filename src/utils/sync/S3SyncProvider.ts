import { IRemoteFileInfo, ISyncProvider } from "@/types/sync";
import { s3ListObjects, s3Upload } from "@/commands";

export interface IS3Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
  urlStyle?: "path" | "virtualHosted";
  pathPrefix: string;
}

export class S3SyncProvider implements ISyncProvider {
  private config: IS3Config;

  constructor(config: IS3Config) {
    this.config = config;
  }

  getProviderName(): string {
    return "S3";
  }

  async uploadFile(objectName: string, content: Uint8Array): Promise<boolean> {
    try {
      const key = this.config.pathPrefix
        ? `${this.config.pathPrefix.replaceAll(/\/$|^\//g, "")}/${objectName}`
        : objectName;

      await s3Upload({
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        bucket: this.config.bucket,
        region: this.config.region,
        endpoint: this.config.endpoint,
        urlStyle: this.config.urlStyle,
        key,
        file: content,
      });

      return true;
    } catch (e) {
      console.error("S3 上传失败:", e);
      return false;
    }
  }

  async downloadFile(objectName: string): Promise<Uint8Array> {
    // S3 下载需要构建 URL 并使用 fetch
    const key = this.config.pathPrefix
      ? `${this.config.pathPrefix.replaceAll(/\/$|^\//g, "")}/${objectName}`
      : objectName;

    let url = "";
    const endpoint =
      this.config.endpoint || `https://s3.${this.config.region}.amazonaws.com`;

    if (this.config.urlStyle === "virtualHosted") {
      if (this.config.endpoint) {
        const endpointUrl = new URL(this.config.endpoint);
        url = `${endpointUrl.protocol}//${this.config.bucket}.${endpointUrl.host}/${key}`;
      } else {
        url = `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
      }
    } else {
      url = `${endpoint.replaceAll(/\/$|^\//g, "")}/${this.config.bucket}/${key}`;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (e) {
      console.error("S3 下载失败:", e);
      throw e;
    }
  }

  async fileExists(objectName: string): Promise<boolean> {
    // S3 检查文件存在可以通过 HEAD 请求
    const key = this.config.pathPrefix
      ? `${this.config.pathPrefix.replaceAll(/\/$|^\//g, "")}/${objectName}`
      : objectName;

    let url = "";
    const endpoint =
      this.config.endpoint || `https://s3.${this.config.region}.amazonaws.com`;

    if (this.config.urlStyle === "virtualHosted") {
      if (this.config.endpoint) {
        const endpointUrl = new URL(this.config.endpoint);
        url = `${endpointUrl.protocol}//${this.config.bucket}.${endpointUrl.host}/${key}`;
      } else {
        url = `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
      }
    } else {
      url = `${endpoint.replaceAll(/\/$|^\//g, "")}/${this.config.bucket}/${key}`;
    }

    try {
      const response = await fetch(url, { method: "HEAD" });
      return response.ok;
    } catch (e) {
      console.error("S3 检查文件存在失败:", e);
      return false;
    }
  }

  async deleteFile(_objectName: string): Promise<boolean> {
    // S3 删除文件需要在后端实现，这里暂不支持
    console.warn("S3 删除文件暂不支持");
    return false;
  }

  async listFiles(prefix?: string): Promise<IRemoteFileInfo[]> {
    const basePrefix = this.config.pathPrefix
      ? this.config.pathPrefix.replaceAll(/\/$|^\//g, "")
      : "";
    const extraPrefix = prefix
      ? prefix.replace(/^\/+/, "").replace(/\/+$/, "")
      : "";
    const combinedPrefix = [basePrefix, extraPrefix]
      .filter((item) => item)
      .join("/");

    try {
      const remoteFiles = await s3ListObjects({
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        bucket: this.config.bucket,
        region: this.config.region,
        endpoint: this.config.endpoint,
        urlStyle: this.config.urlStyle,
        prefix: combinedPrefix,
      });

      return remoteFiles.map((file) => {
        const relativePath = this.normalizeRelativePath(
          file.path || file.name,
          basePrefix,
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
      console.error("S3 获取文件列表失败:", e);
      return [];
    }
  }

  private normalizeRelativePath(remotePath: string, basePrefix: string) {
    const normalized = remotePath.replace(/^\/+/, "");
    const base = (basePrefix || "").replace(/\/+$/, "");
    if (!base) return normalized;
    if (normalized.startsWith(`${base}/`)) {
      return normalized.slice(base.length + 1);
    }
    if (normalized === base) return "";
    return normalized;
  }
}
