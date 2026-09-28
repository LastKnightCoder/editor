import { IRemoteFileInfo, ISyncProvider } from "@/types/sync";
import { createObjectIfAbsent } from "@/commands/ali-oss";
import {
  isObjectExist,
  getObject,
  createObject,
  updateObject,
  deleteObject,
  listObjects,
} from "@/commands";

export interface IAliOSSConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  path: string;
}

export class AliOSSSyncProvider implements ISyncProvider {
  private config: IAliOSSConfig;

  constructor(config: IAliOSSConfig) {
    this.config = config;
  }

  getProviderName(): string {
    return "AliOSS";
  }

  async createFileIfAbsent(objectName: string, content: Uint8Array): Promise<boolean> {
    return createObjectIfAbsent(
      { ...this.config, objectName: `${this.config.path}/${objectName}` },
      content
    );
  }

  async uploadFile(objectName: string, content: Uint8Array): Promise<boolean> {
    try {
      const fullPath = `${this.config.path}/${objectName}`;
      const ossOptions = {
        accessKeyId: this.config.accessKeyId,
        accessKeySecret: this.config.accessKeySecret,
        bucket: this.config.bucket,
        region: this.config.region,
        objectName: fullPath,
      };

      const exists = await this.fileExists(objectName);

      if (exists) {
        await updateObject(ossOptions, content);
      } else {
        await createObject(ossOptions, content);
      }

      return true;
    } catch (e) {
      console.error("AliOSS 上传失败:", e);
      return false;
    }
  }

  async downloadFile(objectName: string): Promise<Uint8Array> {
    try {
      const fullPath = `${this.config.path}/${objectName}`;
      const result = await getObject({
        accessKeyId: this.config.accessKeyId,
        accessKeySecret: this.config.accessKeySecret,
        bucket: this.config.bucket,
        region: this.config.region,
        objectName: fullPath,
      });

      return new Uint8Array(result.content);
    } catch (e) {
      console.error("AliOSS 下载失败:", e);
      throw e;
    }
  }

  async fileExists(objectName: string): Promise<boolean> {
    try {
      const fullPath = `${this.config.path}/${objectName}`;
      return await isObjectExist({
        accessKeyId: this.config.accessKeyId,
        accessKeySecret: this.config.accessKeySecret,
        bucket: this.config.bucket,
        region: this.config.region,
        objectName: fullPath,
      });
    } catch (e) {
      console.error("AliOSS 检查文件存在失败:", e);
      throw e;
    }
  }

  async deleteFile(objectName: string): Promise<boolean> {
    try {
      const fullPath = `${this.config.path}/${objectName}`;
      await deleteObject({
        accessKeyId: this.config.accessKeyId,
        accessKeySecret: this.config.accessKeySecret,
        bucket: this.config.bucket,
        region: this.config.region,
        objectName: fullPath,
      });
      return true;
    } catch (e) {
      console.error("AliOSS 删除文件失败:", e);
      return false;
    }
  }

  async listFiles(prefix?: string): Promise<IRemoteFileInfo[]> {
    const combinedPrefix = prefix
      ? `${this.config.path}/${prefix.replace(/^\/+/, "")}`
      : this.config.path;

    try {
      const remoteFiles = await listObjects({
        accessKeyId: this.config.accessKeyId,
        accessKeySecret: this.config.accessKeySecret,
        bucket: this.config.bucket,
        region: this.config.region,
        prefix: combinedPrefix?.replace(/\/+/g, "/"),
      });

      return remoteFiles.map(file => {
        const relativePath = this.normalizeRelativePath(file.path || file.name);
        const name = relativePath.split("/").filter(Boolean).pop() || relativePath;
        return {
          ...file,
          name,
          path: relativePath,
        };
      });
    } catch (e) {
      console.error("AliOSS 获取文件列表失败:", e);
      return [];
    }
  }

  private normalizeRelativePath(remotePath: string) {
    const normalized = remotePath.replace(/^\/+/, "");
    const base = (this.config.path || "").replace(/^\/+/, "").replace(/\/+$/, "");
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
